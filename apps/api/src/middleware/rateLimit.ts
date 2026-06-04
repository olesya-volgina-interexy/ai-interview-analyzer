import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

export const registerRateLimit = fp(async function (fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    max: 20,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.user?.id ?? request.ip,
    errorResponseBuilder: () => ({
      error: 'Too many requests. Please wait a minute and try again.',
    }),
    allowList: (request) => {
      const expensive = ['/api/chat', '/api/preparation'];
      return !expensive.some(p => request.url.startsWith(p));
    },
  });
});
