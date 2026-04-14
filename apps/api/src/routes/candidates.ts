import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma';
import { clusterTextItems } from '../services/llm.service';

export async function candidateRoutes(fastify: FastifyInstance) {

  fastify.get('/candidates', async (request) => {
    const { search, page, limit } = request.query as {
      search?: string;
      page?: string;
      limit?: string;
    };

    const take = Number(limit ?? 20);
    const skip = (Number(page ?? 1) - 1) * take;

    const interviews = await prisma.interview.findMany({
      where: {
        candidateName: {
          not: null,
          ...(search ? { contains: search, mode: 'insensitive' } : {}),
        },
      },
      select: {
        candidateName: true,
        role: true,
        stage: true,
        decision: true,
        analysis: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Группируем по нормализованному имени
    const grouped: Record<string, typeof interviews> = {};
    for (const i of interviews) {
      const key = i.candidateName!.trim().toLowerCase();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(i);
    }

    const candidates = Object.entries(grouped)
      .map(([, items]) => {
        const latest = items[0];
        const scores = items
          .map(i => (i.analysis as any)?.score)
          .filter((s): s is number => typeof s === 'number');
        const successful = items.filter(i => i.decision === 'hired').length;
        const failed = items.filter(i => i.decision === 'rejected').length;
        const roles = [...new Set(items.map(i => i.role))];

        return {
          candidateName: latest.candidateName,
          totalInterviews: items.length,
          successful,
          failed,
          lastInterviewAt: latest.createdAt.toISOString(),
          roles,
          avgScore: scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : null,
        };
      })
      .sort((a, b) => new Date(b.lastInterviewAt).getTime() - new Date(a.lastInterviewAt).getTime())
      .slice(skip, skip + take);

    return candidates;
  });

  fastify.get<{ Params: { name: string } }>(
    '/candidates/:name',
    async (request, reply) => {
      const name = decodeURIComponent(request.params.name);

      const interviews = await prisma.interview.findMany({
        where: {
          candidateName: { equals: name, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          stage: true,
          role: true,
          level: true,
          decision: true,
          clientName: true,
          managerName: true,
          analysis: true,
          createdAt: true,
        },
      });

      if (interviews.length === 0) {
        return reply.status(404).send({ error: 'Candidate not found' });
      }

      // Собираем weaknesses и decisionBreakers
      const allWeaknesses: string[] = [];
      const allDecisionBreakers: string[] = [];

      for (const i of interviews) {
        const analysis = i.analysis as any;
        for (const w of analysis?.weaknesses ?? []) {
          if (w && (w as string).toLowerCase() !== 'not mentioned') {
            allWeaknesses.push(w as string);
          }
        }
        for (const db of analysis?.decisionBreakers ?? []) {
          if (db) allDecisionBreakers.push(db as string);
        }
      }

      const [topWeaknesses, topDecisionBreakers] = await Promise.all([
        allWeaknesses.length > 0
          ? clusterTextItems(allWeaknesses, 'weaknesses')
          : Promise.resolve([]),
        allDecisionBreakers.length > 0
          ? clusterTextItems(allDecisionBreakers, 'decision_breakers')
          : Promise.resolve([]),
      ]);

      const scores = interviews
        .map(i => (i.analysis as any)?.score)
        .filter((s): s is number => typeof s === 'number');

      return {
        candidateName: name,
        totalInterviews: interviews.length,
        successful: interviews.filter(i => i.decision === 'hired').length,
        failed: interviews.filter(i => i.decision === 'rejected').length,
        avgScore: scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
        roles: [...new Set(interviews.map(i => i.role))],
        topWeaknesses,
        topDecisionBreakers,
        interviews: interviews.map(i => ({
          id: i.id,
          stage: i.stage,
          role: i.role,
          level: i.level,
          decision: i.decision,
          clientName: i.clientName,
          managerName: i.managerName,
          createdAt: i.createdAt.toISOString(),
          recommendation: (i.analysis as any)?.recommendation ?? null,
          stageResult: (i.analysis as any)?.stageResult ?? null,
          score: (i.analysis as any)?.score ?? null,
        })),
      };
    }
  );
}