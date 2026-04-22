import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma';
import { clusterTextItems } from '../services/llm.service';
import type { Prisma } from '@prisma/client';

export async function candidateRoutes(fastify: FastifyInstance) {

  fastify.get('/candidates', async (request) => {
    const { search, page, limit, role, result } = request.query as {
      search?: string;
      page?: string;
      limit?: string;
      role?: string;
      result?: 'hired' | 'not_hired';
    };

    const take = Number(limit ?? 20);
    const skip = (Number(page ?? 1) - 1) * take;

    // Строим условия WHERE
    const conditions: string[] = [`"candidateName" IS NOT NULL`];
    const values: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`LOWER("candidateName") LIKE LOWER($${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    if (role) {
      conditions.push(`role = $${idx}`);
      values.push(role);
      idx++;
    }

    const where = conditions.join(' AND ');

    // Агрегация на уровне SQL
    const rows = await prisma.$queryRawUnsafe<Array<{
      candidateName: string;
      totalInterviews: bigint;
      successful: bigint;
      failed: bigint;
      lastInterviewAt: Date;
      roles: string;
    }>>(
      `SELECT
        "candidateName",
        COUNT(*) as "totalInterviews",
        COUNT(*) FILTER (WHERE decision = 'hired') as "successful",
        COUNT(*) FILTER (WHERE decision = 'rejected') as "failed",
        MAX("createdAt") as "lastInterviewAt",
        STRING_AGG(DISTINCT role, ',') as roles
      FROM "Interview"
      WHERE ${where}
      GROUP BY LOWER("candidateName"), "candidateName"
      ORDER BY MAX("createdAt") DESC`,
      ...values
    );

    // Считаем avgScore отдельно — JSON поле не агрегируется в SQL легко
    const names = rows.map(r => r.candidateName);
    const scoreRows = names.length > 0
      ? await prisma.interview.findMany({
          where: { candidateName: { in: names } },
          select: { candidateName: true, analysis: true },
        })
      : [];

    const scoreMap: Record<string, number[]> = {};
    for (const r of scoreRows) {
      const score = (r.analysis as any)?.score;
      if (typeof score === 'number' && r.candidateName) {
        const key = r.candidateName.toLowerCase();
        if (!scoreMap[key]) scoreMap[key] = [];
        scoreMap[key].push(score);
      }
    }

    let candidates = rows.map(r => {
      const scores = scoreMap[r.candidateName.toLowerCase()] ?? [];
      return {
        candidateName: r.candidateName,
        totalInterviews: Number(r.totalInterviews),
        successful: Number(r.successful),
        failed: Number(r.failed),
        lastInterviewAt: r.lastInterviewAt.toISOString(),
        roles: r.roles ? r.roles.split(',') : [],
        avgScore: scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
      };
    });

    // Фильтр по result (hired/not_hired) — после агрегации
    if (result === 'hired') candidates = candidates.filter(c => c.successful > 0);
    if (result === 'not_hired') candidates = candidates.filter(c => c.successful === 0);

    // Пагинация
    return candidates.slice(skip, skip + take);
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
          linearIssueId: true,
        },
      });

      if (interviews.length === 0) {
        return reply.status(404).send({ error: 'Candidate not found' });
      }

      // Собираем strengths, weaknesses и decisionBreakers
      const allStrengths: string[] = [];
      const allWeaknesses: string[] = [];
      const allDecisionBreakers: string[] = [];

      for (const i of interviews) {
        const analysis = i.analysis as any;
        for (const s of analysis?.strengths ?? []) {
          if (s && (s as string).toLowerCase() !== 'not mentioned') {
            allStrengths.push(s as string);
          }
        }
        // Софт скиллы из manager_call тоже считаем как strengths
        if (analysis?.softSkills) {
          const soft = analysis.softSkills as Record<string, string>;
          for (const [key, value] of Object.entries(soft)) {
            if (value && value.toLowerCase() !== 'not mentioned') {
              allStrengths.push(`${key.replace(/([A-Z])/g, ' $1').trim()}: ${value}`);
            }
          }
        }
        for (const w of analysis?.weaknesses ?? []) {
          if (w && (w as string).toLowerCase() !== 'not mentioned') {
            allWeaknesses.push(w as string);
          }
        }
        for (const db of analysis?.decisionBreakers ?? []) {
          if (db) allDecisionBreakers.push(db as string);
        }
      }

      const [topStrengths, topWeaknesses, topDecisionBreakers] = await Promise.all([
        allStrengths.length > 0
          ? clusterTextItems(allStrengths, 'strengths')
          : Promise.resolve([]),
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

      // CV sent stats
      const issueIds = interviews
        .map(i => i.linearIssueId)
        .filter((id): id is string => !!id);

      const cvStats = issueIds.length > 0
        ? await prisma.incomingRequest.aggregate({
            where: { linearIssueId: { in: issueIds } },
            _sum: { cvSentCount: true },
          })
        : { _sum: { cvSentCount: 0 } };

      const totalCvSent = cvStats._sum.cvSentCount ?? 0;

      return {
        candidateName: name,
        totalInterviews: interviews.length,
        totalCvSent,
        successful: interviews.filter(i => i.decision === 'hired').length,
        failed: interviews.filter(i => i.decision === 'rejected').length,
        avgScore: scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
        roles: [...new Set(interviews.map(i => i.role))],
        topStrengths,
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

  fastify.get('/pipeline-candidates', async (request) => {
    const { search, hasInterviews, clientName, role, from, to, page, limit } = request.query as {
      search?: string;
      hasInterviews?: 'yes' | 'no';
      clientName?: string;
      role?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    };

    const take = Number(limit ?? 20);
    const skip = (Number(page ?? 1) - 1) * take;

    const where: Prisma.PipelineCandidateWhereInput = {};

    if (search) {
      where.candidateName = { contains: search, mode: 'insensitive' };
    }
    if (clientName) {
      where.clientName = { equals: clientName, mode: 'insensitive' };
    }
    if (role) {
      where.role = { equals: role, mode: 'insensitive' };
    }
    if (from || to) {
      where.cvSubmittedAt = {};
      if (from) where.cvSubmittedAt.gte = new Date(from);
      if (to) where.cvSubmittedAt.lte = new Date(to);
    }

    const candidates = await prisma.pipelineCandidate.findMany({
      where,
      orderBy: { cvSubmittedAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        candidateName: true,
        cvUrl: true,
        level: true,
        role: true,
        clientName: true,
        cvSubmittedAt: true,
        linearIssueId: true,
        rootCommentId: true,
      },
    });

    if (candidates.length === 0) return [];

    const issueIds = candidates.map(c => c.linearIssueId);
    const commentIds = candidates.map(c => c.rootCommentId);

    const interviews = await prisma.interview.findMany({
      where: {
        linearIssueId: { in: issueIds },
        parentCommentId: { in: commentIds },
      },
      select: {
        linearIssueId: true,
        parentCommentId: true,
        stage: true,
        decision: true,
        createdAt: true,
      },
    });

    const interviewMap = new Map<string, typeof interviews>();
    for (const iv of interviews) {
      const key = `${iv.linearIssueId}:${iv.parentCommentId}`;
      if (!interviewMap.has(key)) interviewMap.set(key, []);
      interviewMap.get(key)!.push(iv);
    }

    const result = candidates.map(c => {
      const key = `${c.linearIssueId}:${c.rootCommentId}`;
      const ivs = interviewMap.get(key) ?? [];
      const sorted = [...ivs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const last = sorted[0];

      return {
        id: c.id,
        candidateName: c.candidateName,
        cvUrl: c.cvUrl,
        level: c.level,
        role: c.role,
        clientName: c.clientName,
        cvSubmittedAt: c.cvSubmittedAt.toISOString(),
        linearIssueId: c.linearIssueId,
        interviewCount: ivs.length,
        lastStage: last?.stage ?? null,
        lastDecision: last?.decision ?? null,
      };
    });

    if (hasInterviews === 'yes') return result.filter(r => r.interviewCount > 0);
    if (hasInterviews === 'no') return result.filter(r => r.interviewCount === 0);
    return result;
  });
}