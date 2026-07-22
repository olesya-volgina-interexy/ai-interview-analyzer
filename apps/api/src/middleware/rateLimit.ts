import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

export const registerRateLimit = fp(async function (fastify: FastifyInstance) {
  // Applies to every route by default. Auth endpoints get a stricter
  // per-route override (see routes/auth.ts) since they're unauthenticated
  // and the usual brute-force target.
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.user?.id ?? request.ip,
    // The plugin throws whatever this returns — statusCode must be on the
    // object itself or it falls through the global handler as a 500.
    // Cast: the plugin's context type omits statusCode even though the
    // runtime object always includes it (@fastify/rate-limit index.js).
    errorResponseBuilder: (_request, context) => ({
      statusCode: (context as typeof context & { statusCode: number }).statusCode,
      error: 'Too many requests. Please wait a minute and try again.',
    }),
  });
});
