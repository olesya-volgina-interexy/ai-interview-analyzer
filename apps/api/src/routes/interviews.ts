import type { FastifyInstance } from 'fastify';
import { getInterviews, getInterviewById } from '../db/db.service';

export async function interviewRoutes(fastify: FastifyInstance) {
  fastify.get('/interviews', async (request) => {
    const { role, level, stage, clientName, decision, page, limit } = request.query as any;
    return getInterviews({ role, level, stage, clientName, decision, page, limit });
  });

  fastify.get<{ Params: { id: string } }>(
    '/interviews/:id',
    async (request, reply) => {
      const interview = await getInterviewById(request.params.id);
      if (!interview) return reply.status(404).send({ error: 'Not found' });
      return interview;
    }
  );
}