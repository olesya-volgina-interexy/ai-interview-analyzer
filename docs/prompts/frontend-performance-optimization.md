# Frontend Performance Optimization — Implementation Prompt

## Context

This is a monorepo (`pnpm` workspaces) with the following structure:

```
ai-interview-analyzer/
├── apps/
│   ├── web/          ← Vite 8 + React 19 + TypeScript SPA
│   └── api/          ← Node.js 20 + Fastify backend (serves static files in prod)
├── packages/
│   └── shared/       ← Shared Zod schemas
├── docker-compose.yml
└── package.json
```

**Frontend stack:** Vite 8, React 19, TanStack Router v1, TanStack React Query 5, Recharts, Tailwind CSS, shadcn/ui.

**Problem:** The production frontend loads slowly. Root causes:
1. Static files are served by the Node.js API server — no compression, no proper caching headers.
2. All 4 pages and all dependencies (including heavy ones like Recharts, TanStack Table) are bundled into one JS chunk — no code splitting.
3. No Brotli/Gzip pre-compression at build time.
4. No manual vendor chunk splitting — library code and app code share the same hash, breaking long-term caching.
5. No `<link rel="modulepreload">` hints in `index.html`.

---

## Task 1 — Add nginx for static file serving with compression and caching

### Goal
Replace Node.js as the static file server with a dedicated nginx Docker container. nginx must serve the Vite `dist/` output with Brotli compression and correct `Cache-Control` headers.

### Files to create / modify
- **Create** `apps/web/nginx.conf` — nginx server block config
- **Create** `apps/web/Dockerfile` — multi-stage: build Vite app → copy `dist/` into nginx image
- **Modify** `docker-compose.yml` — add `web` service, update `api` service to remove static file serving if applicable

### Exact requirements

**`apps/web/nginx.conf`:**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Brotli (if nginx image supports it) or gzip fallback
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # JS/CSS assets have content-hash in filename — cache 1 year
    location ~* \.(js|css|woff2?|svg|png|ico)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # index.html must never be cached — always revalidate
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    # SPA fallback — all unmatched routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**`apps/web/Dockerfile`:**
```dockerfile
# Stage 1: build
FROM node:20-slim AS builder
RUN npm install -g pnpm
WORKDIR /app
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/web
RUN pnpm build

# Stage 2: serve
FROM nginx:1.27-alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**`docker-compose.yml`** — add the `web` service:
```yaml
web:
  build:
    context: .
    dockerfile: apps/web/Dockerfile
  ports:
    - "80:80"
  depends_on:
    - api
  restart: unless-stopped
```

---

## Task 2 — Lazy loading pages with React.lazy (code splitting)

### Goal
Split the single JS bundle into per-page chunks. Each page is only downloaded when the user navigates to it. This reduces initial bundle size significantly because Recharts, TanStack Table, and other heavy components are only used on specific pages.

### File to modify
`apps/web/src/router.tsx`

### Current state (problem)
```tsx
import { DashboardPage } from './pages/DashboardPage';
import { InterviewsPage } from './pages/InterviewsPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { CandidateDetailPage } from './pages/CandidateDetailPage';
```
All pages are statically imported → one large bundle.

### Required changes

Replace static imports with `React.lazy` dynamic imports and wrap routes in `<Suspense>`:

```tsx
import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Layout } from './components/layout/Layout';

const DashboardPage     = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const InterviewsPage    = lazy(() => import('./pages/InterviewsPage').then(m => ({ default: m.InterviewsPage })));
const CandidatesPage    = lazy(() => import('./pages/CandidatesPage').then(m => ({ default: m.CandidatesPage })));
const CandidateDetailPage = lazy(() => import('./pages/CandidateDetailPage').then(m => ({ default: m.CandidateDetailPage })));

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </Layout>
  ),
});
```

Keep the rest of the route tree unchanged. Vite will automatically emit separate chunks for each lazy-imported page.

> **Note:** The `then(m => ({ default: m.PageName }))` pattern is required because pages use named exports, not default exports.

---

## Task 3 — Manual vendor chunk splitting in vite.config.ts

### Goal
Separate library code from application code in the Vite build output. This ensures that when app code changes, users can still load cached vendor bundles — they only re-download the diff.

### File to modify
`apps/web/vite.config.ts`

### Current state
```ts
build: {
  cssMinify: 'esbuild',
},
```

### Required changes
Add `rollupOptions` with `manualChunks` to the existing `build` block:

```ts
build: {
  cssMinify: 'esbuild',
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react':  ['react', 'react-dom'],
        'vendor-router': ['@tanstack/react-router'],
        'vendor-query':  ['@tanstack/react-query'],
        'vendor-charts': ['recharts'],
        'vendor-table':  ['@tanstack/react-table'],
        'vendor-form':   ['react-hook-form', 'zod'],
        'vendor-ui':     ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-select', '@radix-ui/react-tabs', 'lucide-react'],
      },
    },
  },
},
```

### Verification
After running `pnpm build` in `apps/web`, the `dist/assets/` directory should contain separate files named `vendor-react-*.js`, `vendor-charts-*.js`, etc. Run `pnpm build` and confirm no errors.

---

## Task 4 — Brotli/Gzip pre-compression at build time

### Goal
Generate `.br` and `.gz` sidecar files during the Vite build. nginx (from Task 1) can serve pre-compressed files directly — zero CPU cost per request, faster first byte.

### Package to install
```bash
pnpm add -D vite-plugin-compression --filter @ai-interview-analyzer/web
```
(package name may be `vite-plugin-compression2` — use whichever is compatible with Vite 8)

### File to modify
`apps/web/vite.config.ts`

### Required changes
Import and register the plugin:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import viteCompression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    react({}),
    viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
    viteCompression({ algorithm: 'gzip',           ext: '.gz' }),
  ],
  // ... rest unchanged
})
```

### nginx config update (from Task 1)
Add static Brotli serving to `apps/web/nginx.conf`:

```nginx
# Brotli pre-compressed files
location ~* \.(js|css|svg)$ {
    brotli_static on;
    gzip_static   on;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
```

If the nginx image (`nginx:1.27-alpine`) does not include the `ngx_brotli` module, fall back to `gzip_static on` only and drop `brotli_static`.

### Verification
After `pnpm build`, `dist/assets/` should contain `.js.br` and `.js.gz` files alongside each `.js` file.

---

## Task 5 — Modulepreload hints in index.html

### Goal
Tell the browser to fetch the main JS entry chunk as early as possible — before it even parses the `<script>` tag. This eliminates a browser round-trip and shaves ~100–300 ms off perceived startup on slow connections.

Vite already injects `<link rel="modulepreload">` tags automatically for the entry chunk during build. However, the current `index.html` has no explicit preload setup and uses a plain `<script type="module">` with no preload hints for critical chunks.

### Option A — Let Vite handle it (recommended, zero config)
Vite 5+ automatically injects `modulepreload` for all chunks reachable from the entry point. After implementing Tasks 2 and 3 (lazy loading + manual chunks), verify in the **built** `dist/index.html` that lines like this exist:

```html
<link rel="modulepreload" crossorigin href="/assets/vendor-react-XXXX.js">
<link rel="modulepreload" crossorigin href="/assets/index-XXXX.js">
```

If they are present — no further action needed for this task.

### Option B — Explicit plugin (if Option A preloads are missing)
Install `vite-plugin-html` and use its `injectOptions` to ensure preload tags are present:

```ts
// vite.config.ts — add only if Option A verification shows missing preloads
import { createHtmlPlugin } from 'vite-plugin-html'

plugins: [
  react({}),
  createHtmlPlugin({ minify: true }),
  // ...
]
```

### File to modify
`apps/web/index.html` — update the page title from `"web"` to `"AI Interview Analyzer"` while here:

```html
<title>AI Interview Analyzer</title>
```

---

## Implementation order

Follow this exact order to avoid conflicts:

1. **Task 3** (manual chunks in vite.config) — pure config, no risk
2. **Task 4** (compression plugin) — add plugin alongside Task 3 changes
3. **Task 2** (lazy loading in router.tsx) — depends on nothing, small change
4. **Task 5** (verify/add modulepreload) — verify after Tasks 2+3 build
5. **Task 1** (nginx + Dockerfile + docker-compose) — infrastructure, do last so it wraps the final built output

After each task run:
```bash
cd apps/web && pnpm build
```
and confirm the build succeeds with no TypeScript or Rollup errors before moving to the next task.

---

## Definition of done

- [ ] `pnpm build` succeeds with zero errors
- [ ] `dist/assets/` contains multiple named chunk files (`vendor-react-*.js`, `vendor-charts-*.js`, etc.)
- [ ] `dist/assets/` contains `.js.br` and `.js.gz` files for each JS chunk
- [ ] `dist/index.html` contains `<link rel="modulepreload">` tags
- [ ] `apps/web/Dockerfile` builds successfully: `docker build -f apps/web/Dockerfile .`
- [ ] nginx container serves the app on port 80 and returns correct `Cache-Control` headers
- [ ] The app navigates correctly between all 4 pages (Dashboard, Interviews, Candidates, Candidate Detail) — lazy loading must not break routing
- [ ] No TypeScript errors: `pnpm exec tsc --noEmit` in `apps/web`
