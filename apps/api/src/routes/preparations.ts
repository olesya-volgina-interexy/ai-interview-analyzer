import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma';

const CreateSchema = z.object({
  candidateName: z.string().min(1),
  linearIssueId: z.string().min(1),
  linearIssueTitle: z.string().min(1),
  preparationDate: z.string().min(1),
  type: z.enum(['message', 'call', 'call_setup']),
});

const UpdateSchema = CreateSchema.extend({
  isNewSession: z.boolean().optional().default(false),
});

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  type: z.enum(['message', 'call', 'call_setup']).optional(),
  recency: z.enum(['fresh', 'aging', 'stale']).optional(),
});

function getRecency(date: Date): 'fresh' | 'aging' | 'stale' {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays <= 30) return 'fresh';
  if (diffDays <= 60) return 'aging';
  return 'stale';
}

function serialize(p: {
  id: string;
  candidateName: string;
  linearIssueId: string;
  linearIssueTitle: string;
  preparationDate: Date;
  type: string;
  sessionCount: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...p,
    preparationDate: p.preparationDate.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    recency: getRecency(p.preparationDate),
  };
}

export async function preparationsRoutes(fastify: FastifyInstance) {
  // POST /preparations
  fastify.post('/preparations', async (request, reply) => {
    const body = CreateSchema.parse(request.body);

    const prep = await prisma.preparation.create({
      data: {
        candidateName: body.candidateName,
        linearIssueId: body.linearIssueId,
        linearIssueTitle: body.linearIssueTitle,
        preparationDate: new Date(body.preparationDate),
        type: body.type,
      },
    });

    return reply.status(201).send(serialize(prep));
  });

  // GET /preparations
  fastify.get('/preparations', async (request) => {
    const parsed = ListQuerySchema.parse(request.query);
    const { page, limit, search, type, recency } = parsed;

    const where: any = {};
    if (search) {
      where.candidateName = { contains: search, mode: 'insensitive' };
    }
    if (type) {
      where.type = type;
    }

    if (recency) {
      const now = new Date();
      if (recency === 'fresh') {
        where.preparationDate = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
      } else if (recency === 'aging') {
        where.preparationDate = {
          gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
          lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        };
      } else {
        where.preparationDate = { lt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) };
      }
    }

    const items = await prisma.preparation.findMany({
      where,
      orderBy: { preparationDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit + 1,
    });

    const sliced = items.slice(0, limit);

    // Check which candidates have interviews
    const uniqueNames = [...new Set(sliced.map(p => p.candidateName))];
    const interviewCounts = await prisma.interview.groupBy({
      by: ['candidateName'],
      where: { candidateName: { in: uniqueNames } },
      _count: true,
    });
    const hasInterviewsMap = new Map(interviewCounts.map(c => [c.candidateName, c._count > 0]));

    return sliced.map(p => ({
      ...serialize(p),
      hasInterviews: hasInterviewsMap.get(p.candidateName) ?? false,
    }));
  });

  // PUT /preparations/:id
  fastify.put<{ Params: { id: string } }>(
    '/preparations/:id',
    async (request) => {
      const body = UpdateSchema.parse(request.body);
      const prep = await prisma.preparation.update({
        where: { id: request.params.id },
        data: {
          candidateName: body.candidateName,
          linearIssueId: body.linearIssueId,
          linearIssueTitle: body.linearIssueTitle,
          preparationDate: new Date(body.preparationDate),
          type: body.type,
          ...(body.isNewSession && { sessionCount: { increment: 1 } }),
        },
      });
      return serialize(prep);
    },
  );

  // GET /preparations/stats/:candidateName
  fastify.get<{ Params: { candidateName: string } }>(
    '/preparations/stats/:candidateName',
    async (request) => {
      const candidateName = decodeURIComponent(request.params.candidateName);

      const [agg, last] = await Promise.all([
        prisma.preparation.aggregate({
          where: { candidateName },
          _sum: { sessionCount: true },
        }),
        prisma.preparation.findFirst({
          where: { candidateName },
          orderBy: { preparationDate: 'desc' },
          select: { preparationDate: true },
        }),
      ]);

      return {
        total: agg._sum.sessionCount ?? 0,
        lastPreparationDate: last?.preparationDate.toISOString() ?? null,
        recency: last ? getRecency(last.preparationDate) : null,
      };
    },
  );

  // DELETE /preparations/:id
  fastify.delete<{ Params: { id: string } }>(
    '/preparations/:id',
    async (request, reply) => {
      await prisma.preparation.delete({ where: { id: request.params.id } });
      return reply.status(204).send();
    },
  );
}
