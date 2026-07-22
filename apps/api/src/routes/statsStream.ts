import type { FastifyInstance } from 'fastify';
import { onStatsChanged } from '../services/statsCache';

// Heartbeat keeps intermediary proxies/load balancers from timing out an
// otherwise-idle long-lived connection.
const HEARTBEAT_MS = 20_000;

// Live "stats changed" push for the dashboard (see useStatsLiveUpdates on
// the frontend) — an SSE stream that emits an event the instant
// invalidateStatsCache() runs anywhere in the API, so the dashboard can
// refetch immediately instead of waiting for a manual refresh or the next
// poll. Falls back gracefully: if this connection drops or SSE isn't
// available, the frontend's periodic refetchInterval still keeps data
// reasonably fresh on its own.
//
// Auth note: the browser's native EventSource can't send a custom
// Authorization header, so this route is excluded from the normal
// onRequest JWT hook (see index.ts) and instead verifies the access token
// passed as a query param.
export async function statsStreamRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/stream', async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    try {
      fastify.jwt.verify(token);
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    reply.hijack();

    // Merge in whatever Fastify/plugins (e.g. @fastify/cors) already queued
    // on `reply` — writing via reply.raw directly bypasses Fastify's own
    // header flush, so without this the CORS headers would silently vanish.
    for (const [key, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(key, value as string | string[] | number);
    }
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();
    // A client disconnecting mid-write raises an 'error' on the raw stream;
    // without a listener Node treats it as unhandled and crashes the process.
    reply.raw.on('error', () => {});
    reply.raw.write(': connected\n\n');

    const send = () => {
      reply.raw.write('event: stats-changed\ndata: {}\n\n');
    };
    const unsubscribe = onStatsChanged(send);

    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, HEARTBEAT_MS);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
