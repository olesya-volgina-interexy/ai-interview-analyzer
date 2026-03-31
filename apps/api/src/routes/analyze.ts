import type { FastifyInstance } from 'fastify';
import { AnalyzeRequestSchema } from '@shared/schemas';
import { analyzeQueue } from '../workers/analyze.worker';

export async function analyzeRoutes(fastify: FastifyInstance) {
  fastify.post('/analyze', async (request, reply) => {
    const body = AnalyzeRequestSchema.parse(request.body);

    const job = await analyzeQueue.add('analyze', body, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
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