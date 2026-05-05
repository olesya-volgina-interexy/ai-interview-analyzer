import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma';

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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

export async function clientRoutes(fastify: FastifyInstance) {
  fastify.get('/clients', async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    const { page, limit } = parsed.data;

    const clients = await prisma.client.findMany({
      select: { name: true, description: true },
    });

    const maps = await getAggregateMaps();

    const enriched = clients.map(c => ({
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

      const maps = await getAggregateMaps([name]);
      const aggregates = buildAggregates(name, maps);

      const [recentInterviews, managerRows] = await Promise.all([
        prisma.interview.findMany({
          where: { clientName: name },
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
          where: { clientName: name, managerName: { not: null } },
          select: { managerName: true },
          distinct: ['managerName'],
        }),
      ]);

      return {
        id: client.id,
        name: client.name,
        description: client.description,
        insights: client.insights,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
        ...aggregates,
        recentInterviews: recentInterviews.map(i => ({
          id: i.id,
          candidateName: i.candidateName,
          stage: i.stage,
          decision: i.decision,
          score: (i.analysis as any)?.score ?? null,
          createdAt: i.createdAt.toISOString(),
        })),
        managers: managerRows.map(r => r.managerName).filter((m): m is string => !!m),
      };
    },
  );
}
