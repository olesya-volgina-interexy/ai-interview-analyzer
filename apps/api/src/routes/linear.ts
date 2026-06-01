import type { FastifyInstance } from 'fastify';
import { getIssues } from '../services/linear.service';

export async function linearRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: { search?: string; first?: string };
  }>('/linear/issues', async (request) => {
    const { search, first } = request.query;
    return getIssues({
      search: search || undefined,
      first: first ? parseInt(first, 10) : 50,
    });
  });
}
