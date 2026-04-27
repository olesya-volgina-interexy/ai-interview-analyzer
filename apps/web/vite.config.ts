import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import viteCompression from 'vite-plugin-compression'

if (!process.env.VITE_API_URL) {
  console.warn('[vite] WARNING: VITE_API_URL is not set. API calls will use /api fallback which only works in local dev.');
}

export default defineConfig({
  plugins: [
    react({}),
    viteCompression({ algorithm: 'brotliCompress', ext: '.br', threshold: 1024 }),
    viteCompression({ algorithm: 'gzip',           ext: '.gz', threshold: 1024 }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  build: {
    cssMinify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;

          // Resolve the package name from the LAST node_modules segment in the path.
          // This correctly handles pnpm's nested node_modules under .pnpm/<pkg>@<v>/.
          const lastNm = id.lastIndexOf('node_modules');
          const after  = id.slice(lastNm + 'node_modules'.length).replace(/^[\\/]/, '');
          if (after.startsWith('.pnpm')) return; // skip the .pnpm bookkeeping prefix itself
          const parts  = after.split(/[\\/]/);
          const pkg    = parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1] ?? ''}` : parts[0] ?? '';

          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'vendor-react';
          if (pkg === '@tanstack/react-router') return 'vendor-router';
          if (pkg === '@tanstack/react-query')  return 'vendor-query';
          if (pkg === '@tanstack/react-table')  return 'vendor-table';
          if (pkg === 'recharts' || pkg === 'victory-vendor' || pkg.startsWith('d3-')) return 'vendor-charts';
          if (pkg === 'react-hook-form' || pkg === 'zod' || pkg === '@hookform/resolvers') return 'vendor-form';
          if (pkg === '@base-ui/react' || pkg === 'lucide-react') return 'vendor-ui';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        rewrite: (p: string) => p.replace(/^\/api/, ''),
      },
    },
  },
})