import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma';
import { clusterTextItems } from '../services/llm.service';
import { redis } from '../db/redis';

const CACHE_TTL = 60 * 30; // 30 минут

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/overview', async (request) => {
    const { from, to, refresh } = request.query as { from?: string; to?: string; refresh?: string };

    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Проверяем кеш
    const cacheKey = `stats:overview:${fromDate.toISOString()}:${toDate.toISOString()}`;
    if (refresh === '1') {
      try { await redis.del(cacheKey); } catch {}
    } else {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          fastify.log.info('Stats overview served from cache');
          return JSON.parse(cached);
        }
      } catch (err) {
        fastify.log.warn({ err }, 'Redis cache read failed, proceeding without cache');
      }
    }

    const [requests, interviews, allInterviewsForTiming, allIncomingRequests, historyInPeriod] = await Promise.all([
      prisma.incomingRequest.findMany({
        where: { receivedAt: { gte: fromDate, lte: toDate } },
        select: { status: true, clientName: true, role: true, externalFeedback: true, cvSentCount: true },
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
      prisma.incomingRequest.findMany({
        where: { linearIssueId: { not: null } },
        select: { linearIssueId: true, receivedAt: true },
      }),
      prisma.incomingRequestStatusHistory.findMany({
        where: { request: { receivedAt: { gte: fromDate, lte: toDate } } },
        select: { incomingRequestId: true, status: true, enteredAt: true },
        orderBy: { enteredAt: 'asc' },
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
    const reachedCvSent = requests.filter(r => r.status === 'cv_sent' || r.cvSentCount > 0).length;
    const totalCvSent = requests.reduce((sum, r) => sum + (r.cvSentCount ?? 0), 0);
    const reachedManagerCall = interviews.filter(i => i.stage === 'manager_call').length;
    const reachedTechnical = interviews.filter(i => i.stage === 'technical').length;
    const reachedFinalResult = interviews.filter(i => i.stage === 'final_result').length;
    const hired = interviews.filter(i => i.decision === 'hired').length;
    const rejected = interviews.filter(i => i.decision === 'rejected').length;
    const onHold = requests.filter(r => r.status === 'on_hold').length;
    const total = requests.length;

    // ── Timing stats ──────────────────────────────────────────────────────
    const byIssue = allInterviewsForTiming.reduce((acc, i) => {
      if (!i.linearIssueId) return acc;
      if (!acc[i.linearIssueId]) acc[i.linearIssueId] = [];
      acc[i.linearIssueId].push(i);
      return acc;
    }, {} as Record<string, typeof allInterviewsForTiming>);

    // Map linearIssueId → receivedAt for triage start point
    const triageByIssue = allIncomingRequests.reduce((acc, r) => {
      if (r.linearIssueId) acc[r.linearIssueId] = r.receivedAt;
      return acc;
    }, {} as Record<string, Date>);

    const timings = { triageToManagerCall: [] as number[], managerToTechnical: [] as number[], technicalToFinal: [] as number[], totalDays: [] as number[] };

    for (const [issueId, group] of Object.entries(byIssue)) {
      const triage = triageByIssue[issueId];
      const mc = group.find(i => i.stage === 'manager_call');
      const tc = group.find(i => i.stage === 'technical');
      const fr = group.find(i => i.stage === 'final_result');
      if (triage && mc) timings.triageToManagerCall.push((mc.createdAt.getTime() - triage.getTime()) / 86400000);
      if (mc && tc) timings.managerToTechnical.push((tc.createdAt.getTime() - mc.createdAt.getTime()) / 86400000);
      if (tc && fr) timings.technicalToFinal.push((fr.createdAt.getTime() - tc.createdAt.getTime()) / 86400000);
      if (triage && fr) timings.totalDays.push((fr.createdAt.getTime() - triage.getTime()) / 86400000);
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    // ── Time On Stage по истории статусов ─────────────────────────────────
    const historyByRequest = historyInPeriod.reduce((acc, h) => {
      if (!acc[h.incomingRequestId]) acc[h.incomingRequestId] = [];
      acc[h.incomingRequestId].push(h);
      return acc;
    }, {} as Record<string, typeof historyInPeriod>);

    const stageDurations: Record<string, number[]> = {};
    const daysToHired: number[] = [];
    const DAY_MS = 86_400_000;

    for (const entries of Object.values(historyByRequest)) {
      // Длительность каждой завершённой стадии = время до следующего перехода
      for (let i = 0; i < entries.length - 1; i++) {
        const status = entries[i].status;
        const days = (entries[i + 1].enteredAt.getTime() - entries[i].enteredAt.getTime()) / DAY_MS;
        if (!stageDurations[status]) stageDurations[status] = [];
        stageDurations[status].push(days);
      }

      // Тотал до Hired считаем только по тикетам, дошедшим до найма
      const hiredEntry = entries.find(e => e.status === 'hired');
      if (hiredEntry && entries.length > 0) {
        daysToHired.push((hiredEntry.enteredAt.getTime() - entries[0].enteredAt.getTime()) / DAY_MS);
      }
    }

    const avgTimePerStage = Object.fromEntries(
      Object.entries(stageDurations).map(([status, arr]) => [status, avg(arr)])
    );

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

    const allExternalReasons = requests
      .map(r => r.externalFeedback)
      .filter((f): f is string => !!f && f.trim().length > 0);

    const [topDecisionBreakers, topWeaknesses, topExternalReasons] = await Promise.all([
      allDecisionBreakers.length > 0
        ? clusterTextItems(allDecisionBreakers, 'decision_breakers')
        : Promise.resolve([]),
      allWeaknesses.length > 0
        ? clusterTextItems(allWeaknesses, 'weaknesses')
        : Promise.resolve([]),
      allExternalReasons.length > 0
        ? clusterTextItems(allExternalReasons, 'weaknesses')
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
        reachedCvSent,
        totalCvSent,
        reachedManagerCall,
        reachedTechnical,
        reachedFinalResult,
        hired,
        rejected,
        onHold,
        conversion: {
          managerCallToTechnical: reachedManagerCall > 0
            ? Math.round((reachedTechnical / reachedManagerCall) * 100) : 0,
          technicalToHired: reachedTechnical > 0
            ? Math.round((hired / reachedTechnical) * 100) : 0,
        },
      },
      timing: {
        avgTriageToManagerCallDays: avg(timings.triageToManagerCall),
        avgManagerToTechnicalDays: avg(timings.managerToTechnical),
        avgTechnicalToFinalDays: avg(timings.technicalToFinal),
        avgTotalDays: avg(timings.totalDays),
        avgDaysToHired: avg(daysToHired),
        avgTimePerStage,
        trend,
      },
      quality: {
        topDecisionBreakers,
        topWeaknesses,
        hireRateByRole,
        topExternalReasons,
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
