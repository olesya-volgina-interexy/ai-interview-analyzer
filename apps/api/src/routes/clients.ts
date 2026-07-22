import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { buildClientProfile } from '../services/clientProfile.service';
import {
  getAliasMap,
  getCanonicalKeys,
  clientNameWhere,
  normalizeClientKey,
  mergeClients,
  unmergeClients,
} from '../services/clientAlias.service';
import type { ClientInsights } from '@shared/schemas';
import { invalidateStatsCache } from '../services/statsCache';
import { getScore } from '../utils/scoring';

const PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const MergeClientsSchema = z.object({
  canonicalName: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
});

const UnmergeClientsSchema = z.object({
  aliases: z.array(z.string().min(1)).min(1),
});

type ClientAggregates = {
  interviewCount: number;
  hireRate: number;
  requestCount: number;
  lastInterviewAt: string | null;
};

async function getAggregateMaps(clientNames?: string[]) {
  // Если передан список имён — фильтруем агрегаты только по ним; иначе — по всем.
  const nameFilter = clientNames
    ? { clientName: { in: clientNames } }
    : { clientName: { not: null } as const };

  const [interviewAgg, hiredAgg, requestAgg] = await Promise.all([
    prisma.interview.groupBy({
      by: ['clientName'],
      where: nameFilter,
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.interview.groupBy({
      by: ['clientName'],
      where: { ...nameFilter, decision: 'hired' },
      _count: { _all: true },
    }),
    prisma.incomingRequest.groupBy({
      by: ['clientName'],
      where: nameFilter,
      _count: { _all: true },
    }),
  ]);

  const interviewMap = new Map<string, { count: number; lastAt: Date | null }>();
  for (const row of interviewAgg) {
    if (!row.clientName) continue;
    interviewMap.set(row.clientName, {
      count: row._count._all,
      lastAt: row._max.createdAt,
    });
  }

  const hiredMap = new Map<string, number>();
  for (const row of hiredAgg) {
    if (!row.clientName) continue;
    hiredMap.set(row.clientName, row._count._all);
  }

  const requestMap = new Map<string, number>();
  for (const row of requestAgg) {
    if (!row.clientName) continue;
    requestMap.set(row.clientName, row._count._all);
  }

  return { interviewMap, hiredMap, requestMap };
}

function buildAggregates(
  name: string,
  maps: Awaited<ReturnType<typeof getAggregateMaps>>,
): ClientAggregates {
  const interview = maps.interviewMap.get(name);
  const interviewCount = interview?.count ?? 0;
  const hired = maps.hiredMap.get(name) ?? 0;
  const requestCount = maps.requestMap.get(name) ?? 0;

  return {
    interviewCount,
    hireRate: interviewCount > 0 ? Math.round((hired / interviewCount) * 100) : 0,
    requestCount,
    lastInterviewAt: interview?.lastAt ? interview.lastAt.toISOString() : null,
  };
}

function foldMaps(
  maps: Awaited<ReturnType<typeof getAggregateMaps>>,
  canon: (raw: string) => string,
): Awaited<ReturnType<typeof getAggregateMaps>> {
  const interviewMap = new Map<string, { count: number; lastAt: Date | null }>();
  for (const [raw, v] of maps.interviewMap) {
    const c = canon(raw);
    const ex = interviewMap.get(c);
    if (!ex) interviewMap.set(c, { count: v.count, lastAt: v.lastAt });
    else {
      ex.count += v.count;
      if (v.lastAt && (!ex.lastAt || v.lastAt > ex.lastAt)) ex.lastAt = v.lastAt;
    }
  }

  const hiredMap = new Map<string, number>();
  for (const [raw, n] of maps.hiredMap) {
    const c = canon(raw);
    hiredMap.set(c, (hiredMap.get(c) ?? 0) + n);
  }

  const requestMap = new Map<string, number>();
  for (const [raw, n] of maps.requestMap) {
    const c = canon(raw);
    requestMap.set(c, (requestMap.get(c) ?? 0) + n);
  }

  return { interviewMap, hiredMap, requestMap };
}

export async function clientRoutes(fastify: FastifyInstance) {
  fastify.get('/clients', async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    const { page, limit } = parsed.data;

    const [clients, aliasMap, rawMaps] = await Promise.all([
      prisma.client.findMany({ select: { name: true, description: true } }),
      getAliasMap(),
      getAggregateMaps(),
    ]);

    const canon = (raw: string) => aliasMap.get(normalizeClientKey(raw)) ?? raw;
    const maps = foldMaps(rawMaps, canon);

    const byCanonical = new Map<string, { name: string; description: string | null }>();
    for (const c of clients) {
      const name = canon(c.name);
      const existing = byCanonical.get(name);
      if (!existing) byCanonical.set(name, { name, description: c.description });
      else if (!existing.description && c.description) existing.description = c.description;
    }

    const enriched = [...byCanonical.values()].map(c => ({
      name: c.name,
      description: c.description,
      ...buildAggregates(c.name, maps),
    }));

    enriched.sort((a, b) => b.interviewCount - a.interviewCount);

    const start = (page - 1) * limit;
    return {
      total: enriched.length,
      page,
      limit,
      items: enriched.slice(start, start + limit),
    };
  });

  fastify.get<{ Params: { name: string } }>(
    '/clients/:name',
    async (request, reply) => {
      const name = decodeURIComponent(request.params.name);

      const client = await prisma.client.findUnique({ where: { name } });
      if (!client) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      const keys = await getCanonicalKeys(name);
      const where = clientNameWhere(keys);

      const [interviewCount, hired, requestCount, lastInterview, recentInterviews, managerRows] =
        await Promise.all([
          prisma.interview.count({ where }),
          prisma.interview.count({ where: { AND: [where, { decision: 'hired' }] } }),
          prisma.incomingRequest.count({ where }),
          prisma.interview.findFirst({
            where,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
          prisma.interview.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              candidateName: true,
              stage: true,
              decision: true,
              analysis: true,
              createdAt: true,
            },
          }),
          prisma.interview.findMany({
            where: { AND: [where, { managerName: { not: null } }] },
            select: { managerName: true },
            distinct: ['managerName'],
          }),
        ]);

      const aliasRows = await prisma.clientAlias.findMany({
        where: { canonicalName: name },
        select: { alias: true },
      });

      return {
        id: client.id,
        name: client.name,
        description: client.description,
        insights: client.insights,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
        interviewCount,
        hireRate: interviewCount > 0 ? Math.round((hired / interviewCount) * 100) : 0,
        requestCount,
        lastInterviewAt: lastInterview?.createdAt ? lastInterview.createdAt.toISOString() : null,
        aliases: aliasRows.map(a => a.alias),
        recentInterviews: recentInterviews.map(i => ({
          id: i.id,
          candidateName: i.candidateName,
          stage: i.stage,
          decision: i.decision,
          score: getScore(i.analysis) ?? null,
          createdAt: i.createdAt.toISOString(),
        })),
        managers: managerRows.map(r => r.managerName).filter((m): m is string => !!m),
      };
    },
  );

  fastify.post('/clients/merge', async (request, reply) => {
    const parsed = MergeClientsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    try {
      const result = await mergeClients(parsed.data.canonicalName, parsed.data.aliases);
      await invalidateStatsCache();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Merge failed';
      return reply.status(400).send({ error: message });
    }
  });

  fastify.post('/clients/unmerge', async (request, reply) => {
    const parsed = UnmergeClientsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const removed = await unmergeClients(parsed.data.aliases);
    await invalidateStatsCache();
    return { removed };
  });

  fastify.get<{ Params: { name: string } }>(
    '/clients/:name/profile',
    async (request, reply) => {
      const name = decodeURIComponent(request.params.name);

      const client = await prisma.client.findUnique({ where: { name } });
      if (!client) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      const cached = client.insights as ClientInsights | null;
      const cacheAgeMs = Date.now() - client.updatedAt.getTime();
      const isFresh = cacheAgeMs < PROFILE_CACHE_TTL_MS;
      const cachedCount = cached?.basedOnInterviews;

      if (cached && isFresh && typeof cachedCount === 'number') {
        const currentCount = await prisma.interview.count({
          where: { clientName: name },
        });
        if (currentCount <= cachedCount) {
          return cached;
        }
      }

      try {
        return await buildClientProfile(name);
      } catch (err) {
        fastify.log.error(err, 'buildClientProfile failed');
        return reply.status(500).send({ error: 'Failed to build client profile' });
      }
    },
  );

  fastify.post<{ Params: { name: string } }>(
    '/clients/:name/profile/rebuild',
    async (request, reply) => {
      const name = decodeURIComponent(request.params.name);

      const client = await prisma.client.findUnique({ where: { name } });
      if (!client) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      try {
        return await buildClientProfile(name);
      } catch (err) {
        fastify.log.error(err, 'buildClientProfile failed');
        return reply.status(500).send({ error: 'Failed to build client profile' });
      }
    },
  );
}
