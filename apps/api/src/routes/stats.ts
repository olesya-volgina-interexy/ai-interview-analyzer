import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma';
import { clusterTextItems } from '../services/llm.service';
import { redis } from '../workers/analyze.worker';

const CACHE_TTL = 60 * 30; // 30 минут

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/overview', async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };

    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Проверяем кеш
    const cacheKey = `stats:overview:${fromDate.toISOString()}:${toDate.toISOString()}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        fastify.log.info('Stats overview served from cache');
        return JSON.parse(cached);
      }
    } catch (err) {
      fastify.log.warn({ err }, 'Redis cache read failed, proceeding without cache');
    }

    const [requests, interviews, allInterviewsForTiming] = await Promise.all([
      prisma.incomingRequest.findMany({
        where: { receivedAt: { gte: fromDate, lte: toDate } },
        select: { status: true, clientName: true, role: true },
      }),
      prisma.interview.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        select: { stage: true, decision: true, role: true, level: true, analysis: true, createdAt: true, linearIssueId: true },
      }),
      prisma.interview.findMany({
        where: { linearIssueId: { not: null } },
        select: { stage: true, createdAt: true, linearIssueId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Requests stats
    const byStatus = requests.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byClient = requests.reduce((acc, r) => {
      if (r.clientName) acc[r.clientName] = (acc[r.clientName] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byRole = requests.reduce((acc, r) => {
      if (r.role) acc[r.role] = (acc[r.role] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Pipeline stats
    const reachedManagerCall = interviews.filter(i => i.stage === 'manager_call').length;
    const reachedTechnical = interviews.filter(i => i.stage === 'technical').length;
    const reachedFinalResult = interviews.filter(i => i.stage === 'final_result').length;
    const hired = interviews.filter(i => i.decision === 'hired').length;
    const rejected = interviews.filter(i => i.decision === 'rejected').length;
    const total = requests.length;

    // ── Timing stats ──────────────────────────────────────────────────────
    const byIssue = allInterviewsForTiming.reduce((acc, i) => {
      if (!i.linearIssueId) return acc;
      if (!acc[i.linearIssueId]) acc[i.linearIssueId] = [];
      acc[i.linearIssueId].push(i);
      return acc;
    }, {} as Record<string, typeof allInterviewsForTiming>);

    const timings = { managerToTechnical: [] as number[], technicalToFinal: [] as number[], totalDays: [] as number[] };

    for (const group of Object.values(byIssue)) {
      const mc = group.find(i => i.stage === 'manager_call');
      const tc = group.find(i => i.stage === 'technical');
      const fr = group.find(i => i.stage === 'final_result');
      if (mc && tc) timings.managerToTechnical.push((tc.createdAt.getTime() - mc.createdAt.getTime()) / 86400000);
      if (tc && fr) timings.technicalToFinal.push((fr.createdAt.getTime() - tc.createdAt.getTime()) / 86400000);
      if (mc && fr) timings.totalDays.push((fr.createdAt.getTime() - mc.createdAt.getTime()) / 86400000);
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    // Тренд по месяцам
    const trendMap = interviews.reduce((acc, i) => {
      const key = `${i.createdAt.getFullYear()}-${String(i.createdAt.getMonth() + 1).padStart(2, '0')}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const trend = Object.entries(trendMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));

    // ── Quality stats ─────────────────────────────────────────────────────
    const allDecisionBreakers: string[] = [];
    const allWeaknesses: string[] = [];

    for (const interview of interviews) {
      const analysis = interview.analysis as any;
      for (const db of analysis?.decisionBreakers ?? []) {
        if (db && (db as string).trim()) allDecisionBreakers.push(db as string);
      }
      for (const w of analysis?.weaknesses ?? []) {
        if (w && (w as string).trim() && (w as string).toLowerCase() !== 'not mentioned') {
          allWeaknesses.push(w as string);
        }
      }
    }

    const [topDecisionBreakers, topWeaknesses] = await Promise.all([
      allDecisionBreakers.length > 0
        ? clusterTextItems(allDecisionBreakers, 'decision_breakers')
        : Promise.resolve([]),
      allWeaknesses.length > 0
        ? clusterTextItems(allWeaknesses, 'weaknesses')
        : Promise.resolve([]),
    ]);

    // Hire rate по ролям
    const hireByRole: Record<string, { hired: number; total: number }> = {};
    for (const i of interviews.filter(i => i.stage === 'technical')) {
      const role = i.role;
      if (!hireByRole[role]) hireByRole[role] = { hired: 0, total: 0 };
      hireByRole[role].total++;
      if (i.decision === 'hired') hireByRole[role].hired++;
    }
    const hireRateByRole = Object.entries(hireByRole).map(([role, { hired, total }]) => ({
      role,
      hireRate: Math.round((hired / total) * 100),
      total,
    }));

    // ── Candidate stats ───────────────────────────────────────────────────
    const scoresByLevel: Record<string, number[]> = {};
    const scoresByRole: Record<string, number[]> = {};

    for (const i of interviews) {
      const score = (i.analysis as any)?.score;
      if (score == null) continue;
      if (!scoresByLevel[i.level]) scoresByLevel[i.level] = [];
      scoresByLevel[i.level].push(score);
      if (!scoresByRole[i.role]) scoresByRole[i.role] = [];
      scoresByRole[i.role].push(score);
    }

    const avgScoreByLevel = Object.entries(scoresByLevel).map(([level, scores]) => ({
      level,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }));

    const avgScoreByRole = Object.entries(scoresByRole).map(([role, scores]) => ({
      role,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }));

    const result = {
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      requests: { total, byStatus, byClient, byRole },
      pipeline: {
        reachedManagerCall,
        reachedTechnical,
        reachedFinalResult,
        hired,
        rejected,
        conversion: {
          managerCallToTechnical: reachedManagerCall > 0
            ? Math.round((reachedTechnical / reachedManagerCall) * 100) : 0,
          technicalToHired: reachedTechnical > 0
            ? Math.round((hired / reachedTechnical) * 100) : 0,
        },
      },
      timing: {
        avgManagerToTechnicalDays: avg(timings.managerToTechnical),
        avgTechnicalToFinalDays: avg(timings.technicalToFinal),
        avgTotalDays: avg(timings.totalDays),
        trend,
      },
      quality: {
        topDecisionBreakers,
        topWeaknesses,
        hireRateByRole,
      },
      candidates: {
        avgScoreByLevel,
        avgScoreByRole,
      },
    };
    
    // Сохраняем в кеш
    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch (err) {
      fastify.log.warn({ err }, 'Redis cache write failed');
    }

    return result;
  });
}
