import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { LoginRequestSchema, RefreshRequestSchema } from '@shared/schemas';
import { prisma } from '../db/prisma';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/login', async (request, reply) => {
    const { email, password, rememberMe } = LoginRequestSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const accessToken = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '15m' }
    );
    const refreshToken = fastify.jwt.sign(
      { id: user.id, type: 'refresh' },
      { expiresIn: rememberMe ? '30d' : '1d' }
    );

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  fastify.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = RefreshRequestSchema.parse(request.body);

    let payload: { id: string; type?: string };
    try {
      payload = fastify.jwt.verify(refreshToken);
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    if (payload.type !== 'refresh') {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    const newAccessToken = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '15m' }
    );
    const newRefreshToken = fastify.jwt.sign(
      { id: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    return reply.send({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  });

  fastify.get(
    '/auth/me',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
      });
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      return reply.send({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
    }
  );
}
