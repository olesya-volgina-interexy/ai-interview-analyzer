# ── Stage 1: build ──
FROM node:20-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/api

RUN pnpm exec prisma generate
RUN pnpm build

# ── Stage 2: production ──
FROM node:20-slim

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/api

RUN pnpm exec prisma generate

COPY --from=builder /app/apps/api/dist ./dist

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]