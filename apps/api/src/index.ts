import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

app.register(cors, { origin: 'http://localhost:5173' });

app.get('/health', async () => {
  return { status: 'ok', version: '1.0.0' };
});

const start = async () => {
  try {
    await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();