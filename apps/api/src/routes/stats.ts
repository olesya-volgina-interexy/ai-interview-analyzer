import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma';

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/overview', async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };

    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [requests, interviews] = await Promise.all([
      prisma.incomingRequest.findMany({
        where: { receivedAt: { gte: fromDate, lte: toDate } },
        select: { status: true, clientName: true, role: true },
      }),
      prisma.interview.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        select: { stage: true, decision: true },
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

    return {
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      requests: { total, byStatus, byClient, byRole },
      pipeline: {
        reachedManagerCall,
        reachedTechnical,
        reachedFinalResult,
        hired,
        rejected,
        conversion: {
          requestToManagerCall: reachedManagerCall > 0 && reachedTechnical > 0
            ? Math.round((reachedTechnical / reachedManagerCall) * 100) : 0,
          managerCallToTechnical: reachedManagerCall > 0
            ? Math.round((reachedTechnical / reachedManagerCall) * 100) : 0,
          technicalToHired: reachedTechnical > 0
            ? Math.round((hired / reachedTechnical) * 100) : 0,
        },
      },
    };
  });
}