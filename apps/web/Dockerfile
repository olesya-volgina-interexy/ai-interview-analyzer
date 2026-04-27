# syntax=docker/dockerfile:1.6

# ---- Stage 1: build the Vite SPA ----
FROM node:20-slim AS builder

RUN npm install -g pnpm@10.33.0

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

RUN pnpm install --frozen-lockfile --filter @app/web... --filter ./packages/...

WORKDIR /app/apps/web

# VITE_API_URL is baked into the bundle at build time — pass via --build-arg
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm build

# ---- Stage 2: serve via nginx ----
FROM nginx:1.27-alpine AS runner

# Replace default config with our SPA-aware one
RUN rm /etc/nginx/conf.d/default.conf
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets (incl. .gz sidecars served via gzip_static)
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
