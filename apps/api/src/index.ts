import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from './db/prisma';
import { initQdrantCollection } from './db/qdrant';
import { analyzeRoutes } from './routes/analyze';
import { interviewRoutes } from './routes/interviews';
import { statsRoutes } from './routes/stats';
import { candidateRoutes } from './routes/candidates';
import './workers/analyze.worker';
import { linearWebhookRoutes } from './routes/webhooks/linear';
import { verifyLinearAuth } from './services/linear.service';

const app = Fastify({ logger: true });

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5173'];

if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.warn('WARNING: CORS_ORIGIN is not set in production. All cross-origin requests will be blocked.');
}

app.register(cors, { origin: corsOrigins });
app.register(linearWebhookRoutes);

app.register(analyzeRoutes, { prefix: '/api' });
app.register(interviewRoutes, { prefix: '/api' });
app.register(statsRoutes, { prefix: '/api' });
app.register(candidateRoutes, { prefix: '/api' });

app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

const REQUIRED_ENV = [
  'DATABASE_URL', 'REDIS_URL', 'QDRANT_URL',
  'LLM_API_KEY', 'LLM_BASE_URL', 'LINEAR_API_KEY',
  'LINEAR_WEBHOOK_SECRET',
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
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);