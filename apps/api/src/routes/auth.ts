import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  UpdateProfileRequestSchema,
  ChangePasswordRequestSchema,
  AdminResetPasswordRequestSchema,
} from '@shared/schemas';
import { prisma } from '../db/prisma';

type AuthUserFields = { id: string; email: string; name: string | null; jobTitle: string | null; role: string };

function toAuthUser(user: AuthUserFields) {
  return { id: user.id, email: user.email, name: user.name, jobTitle: user.jobTitle, role: user.role };
}

// Comma-separated list of email domains allowed to self-register (e.g. "interexy.com,partner.com").
// Defaults to interexy.com. Self-registration is rejected for any other domain.
const ALLOWED_SIGNUP_DOMAINS = (process.env.ALLOWED_SIGNUP_DOMAINS ?? 'interexy.com')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean);

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/register', async (request, reply) => {
    const { email, password, name } = RegisterRequestSchema.parse(request.body);
    const normalizedEmail = email.trim().toLowerCase();

    const domain = normalizedEmail.split('@')[1];
    if (!domain || !ALLOWED_SIGNUP_DOMAINS.includes(domain)) {
      return reply.status(403).send({
        error: `Registration is restricted to ${ALLOWED_SIGNUP_DOMAINS.join(', ')} email addresses`,
      });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return reply.status(409).send({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: passwordHash,
        name: name ?? null,
        role: 'recruiter',
      },
    });

    const accessToken = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '15m' }
    );
    const refreshToken = fastify.jwt.sign(
      { id: user.id, type: 'refresh' },
      { expiresIn: '1d' }
    );

    return reply.status(201).send({
      accessToken,
      refreshToken,
      user: toAuthUser(user),
    });
  });

  fastify.post('/auth/login', async (request, reply) => {
    const { email, password, rememberMe } = LoginRequestSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
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
      user: toAuthUser(user),
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
      return reply.send(toAuthUser(user));
    }
  );

  // Self-service: update your own profile (name + job title). Email is immutable here.
  fastify.patch(
    '/auth/profile',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { name, jobTitle } = UpdateProfileRequestSchema.parse(request.body);

      const user = await prisma.user.update({
        where: { id: request.user.id },
        data: { name, jobTitle: jobTitle ?? null },
      });

      return reply.send(toAuthUser(user));
    }
  );

  // Self-service: change your own password (must be logged in + know current password).
  fastify.post(
    '/auth/change-password',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { currentPassword, newPassword } = ChangePasswordRequestSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const passwordMatches = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatches) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
      });

      return reply.send({ success: true });
    }
  );

  // Admin rescue: reset any user's password by email. Admin role required.
  fastify.post(
    '/auth/admin/reset-password',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Admin access required' });
      }

      const { email, newPassword } = AdminResetPasswordRequestSchema.parse(request.body);
      const normalizedEmail = email.trim().toLowerCase();

      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        return reply.status(404).send({ error: 'No user found with that email' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
      });

      return reply.send({ success: true, email: user.email });
    }
  );
}
