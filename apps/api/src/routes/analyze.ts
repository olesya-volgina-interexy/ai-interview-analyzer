import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { AnalyzeRequestSchema } from '@shared/schemas';
import { analyzeQueue } from '../workers/analyze.worker';

// Stable job id from request payload — within the retention window below,
// a duplicate submit returns the existing job instead of creating a new one.
function buildDedupJobId(body: unknown): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex')
    .slice(0, 16);
  return `analyze:${hash}`;
}

export async function analyzeRoutes(fastify: FastifyInstance) {
  fastify.post('/analyze', async (request, reply) => {
    const body = AnalyzeRequestSchema.parse(request.body);
    const jobId = buildDedupJobId(body);

    const job = await analyzeQueue.add('analyze', body, {
      jobId,
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    });

    return reply.status(202).send({ jobId: job.id });
  });

  fastify.get<{ Params: { jobId: string } }>(
    '/analyze/:jobId/status',
    async (request, reply) => {
      const { jobId } = request.params;
      const job = await analyzeQueue.getJob(jobId);

      if (!job) return reply.status(404).send({ error: 'Job not found' });

      const state = await job.getState();
      const progress = job.progress;
      const result = job.returnvalue;

      return { jobId, state, progress, result };
    }
  );
}