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

const app = Fastify({ logger: true });

app.register(cors, {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173'],
});
app.register(linearWebhookRoutes);

app.register(analyzeRoutes);
app.register(interviewRoutes);
app.register(statsRoutes);
app.register(candidateRoutes);

app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

const start = async () => {
  try {
    await prisma.$connect();
    app.log.info('PostgreSQL connected');

    await initQdrantCollection();
    app.log.info('Qdrant ready');

    await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();