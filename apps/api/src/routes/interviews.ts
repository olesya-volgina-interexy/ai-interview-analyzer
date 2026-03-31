import type { FastifyInstance } from 'fastify';
import { getInterviews, getInterviewById } from '../db/db.service';
import { prisma } from '../db/prisma';

export async function interviewRoutes(fastify: FastifyInstance) {
  fastify.get('/interviews', async (request) => {
    const { role, level, stage, clientName, decision, page, limit } = request.query as any;
    return getInterviews({ role, level, stage, clientName, decision, page, limit });
  });

  fastify.get('/interviews/stats', async () => {
  const interviews = await prisma.interview.findMany({
    select: { role: true, stage: true, decision: true, analysis: true, createdAt: true }
  });

  const total = interviews.length;
  const hired = interviews.filter(i => i.decision === 'hired').length;
  const hireRate = total > 0 ? Math.round((hired / total) * 100) : 0;

  const scores = interviews
    .map(i => (i.analysis as any)?.score)
    .filter(Boolean) as number[];
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const byRole = interviews.reduce((acc, i) => {
    acc[i.role] = (acc[i.role] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byStage = interviews.reduce((acc, i) => {
    acc[i.stage] = (acc[i.stage] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return { total, hireRate, avgScore, byRole, byStage };
  });

  fastify.get<{ Params: { id: string } }>(
    '/interviews/:id',
    async (request, reply) => {
      const interview = await getInterviewById(request.params.id);
      if (!interview) return reply.status(404).send({ error: 'Not found' });
      return interview;
    }
  );
  fastify.delete<{ Params: { id: string } }>(
    '/interviews/:id',
    async (request, reply) => {
      const { id } = request.params;
      await prisma.interview.delete({ where: { id } });
      return reply.status(204).send();
    }
  );
}