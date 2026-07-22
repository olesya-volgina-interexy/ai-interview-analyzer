import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { ZodError } from 'zod';
import { prisma } from './db/prisma';
import { initQdrantCollection } from './db/qdrant';
import { analyzeRoutes } from './routes/analyze';
import { interviewRoutes } from './routes/interviews';
import { statsRoutes } from './routes/stats';
import { statsStreamRoutes } from './routes/statsStream';
import { candidateRoutes } from './routes/candidates';
import { clientRoutes } from './routes/clients';
import { uploadRoutes } from './routes/upload';
import { preparationRoutes } from './routes/preparation';
import { authRoutes } from './routes/auth';
import { linearRoutes } from './routes/linear';
import { preparationsRoutes } from './routes/preparations';
import './workers/analyze.worker';
import './workers/preparation.worker';
import './workers/cvConsistency.worker';
import { linearWebhookRoutes } from './routes/webhooks/linear';
import { verifyLinearAuth } from './services/linear.service';
import { shutdownPdfService } from './services/pdf.service';
import { registerAuth } from './middleware/auth';
import { registerRateLimit } from './middleware/rateLimit';

const app = Fastify({ logger: true });

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5173'];

if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.warn('WARNING: CORS_ORIGIN is not set in production. All cross-origin requests will be blocked.');
}

app.register(helmet);
app.register(cors, { origin: corsOrigins });
app.register(registerAuth);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'Invalid request', details: error.flatten() });
  }
  // Some plugins (e.g. @fastify/rate-limit with a custom errorResponseBuilder)
  // throw a plain object rather than an Error, so .message may not exist.
  const statusCode = typeof (error as any).statusCode === 'number' ? (error as any).statusCode : undefined;
  if (statusCode && statusCode < 500) {
    const message = error instanceof Error ? error.message : (error as any).error ?? 'Request failed';
    return reply.status(statusCode).send({ error: message });
  }
  request.log.error(error);
  return reply.status(500).send({ error: 'Internal server error' });
});

app.addHook('onRequest', async (request, reply) => {
  const open = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/health'];
  if (open.includes(request.url)) return;
  if (request.url.startsWith('/webhooks/linear')) return;
  // The browser's EventSource can't send an Authorization header, so this
  // route takes its token as a query param and verifies it itself.
  if (request.url.startsWith('/api/stats/stream')) return;
  return app.authenticate(request, reply);
});

app.register(registerRateLimit);
app.register(linearWebhookRoutes);
app.register(analyzeRoutes, { prefix: '/api' });
app.register(interviewRoutes, { prefix: '/api' });
app.register(statsRoutes, { prefix: '/api' });
app.register(statsStreamRoutes, { prefix: '/api' });
app.register(candidateRoutes, { prefix: '/api' });
app.register(clientRoutes, { prefix: '/api' });
app.register(uploadRoutes, { prefix: '/api' });
app.register(preparationRoutes, { prefix: '/api' });
app.register(authRoutes, { prefix: '/api' });
app.register(linearRoutes, { prefix: '/api' });
app.register(preparationsRoutes, { prefix: '/api' });

app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

const REQUIRED_ENV = [
  'DATABASE_URL', 'REDIS_URL', 'QDRANT_URL',
  'LLM_API_KEY', 'LLM_BASE_URL', 'LINEAR_API_KEY',
  'LINEAR_WEBHOOK_SECRET', 'JWT_SECRET',
];

const start = async () => {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    await prisma.$connect();
    app.log.info('PostgreSQL connected');

    await initQdrantCollection();
    app.log.info('Qdrant ready');

    // Проверяем, что Linear API-ключ реально работает.
    // Не кидаем — сервис поднимется, но в логе будет видно если ключ протух.
    await verifyLinearAuth();

    await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

const shutdown = async () => {
  app.log.info('Shutting down...');
  await app.close();
  await shutdownPdfService();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);