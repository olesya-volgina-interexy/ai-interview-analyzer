import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getInterviews, getInterviewById } from '../db/db.service';
import { prisma } from '../db/prisma';
import { getScore, avg } from '../utils/scoring';
import { markdownToPdf } from '../services/pdf.service';
import { buildInterviewReportMarkdown } from '../services/interviewReport.service';

export async function interviewRoutes(fastify: FastifyInstance) {
  fastify.get('/interviews', async (request) => {
    const { role, level, stage, clientName, decision, managerName, page, limit } = request.query as any;
    return getInterviews({
      role,
      level,
      stage,
      clientName,
      decision,
      managerName,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  });

  fastify.get('/interviews/stats', async () => {
  const interviews = await prisma.interview.findMany({
    select: { role: true, stage: true, decision: true, analysis: true, createdAt: true }
  });

  const total = interviews.length;
  const hired = interviews.filter(i => i.decision === 'hired').length;
  const hireRate = total > 0 ? Math.round((hired / total) * 100) : 0;

  const scores = interviews
    .map(i => getScore(i.analysis))
    .filter(Boolean) as number[];
  const avgScore = avg(scores) ?? 0;

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

  fastify.get('/interviews/managers', async () => {
    const rows = await prisma.interview.findMany({
      where: { managerName: { not: null } },
      select: { managerName: true },
      distinct: ['managerName'],
    });
    return rows.map(r => r.managerName).filter(Boolean);
  });

  fastify.get('/interviews/roles', async () => {
    const rows = await prisma.interview.findMany({
      where: { role: { not: '' } },
      select: { role: true },
      distinct: ['role'],
      orderBy: { role: 'asc' },
    });
    return rows.map(r => r.role).filter(Boolean);
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

  fastify.get<{ Params: { id: string } }>(
    '/interviews/:id/pdf',
    async (request, reply) => {
      const { id } = request.params;
      const interview = await getInterviewById(id);
      if (!interview) return reply.status(404).send({ error: 'Not found' });

      const markdown = buildInterviewReportMarkdown(interview);
      const title = `${interview.candidateName ?? 'Candidate'} — ${interview.stage} analysis`;
      const pdf = await markdownToPdf(markdown, title);

      const safeName = `${interview.candidateName ?? 'candidate'}-${interview.stage}-analysis.pdf`
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${safeName}"`)
        .send(pdf);
    }
  );

  fastify.patch<{ Params: { id: string } }>(
    '/interviews/:id',
    async (request, reply) => {
      const { id } = request.params;
      const body = z.object({
        candidateName: z.string().trim().optional(),
        managerName: z.string().trim().optional(),
      }).parse(request.body);

      const existing = await prisma.interview.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Not found' });

      const data: Record<string, string | null> = {};
      if (body.candidateName !== undefined) data.candidateName = body.candidateName || null;
      if (body.managerName !== undefined) data.managerName = body.managerName || null;

      return prisma.interview.update({ where: { id }, data });
    }
  );
}