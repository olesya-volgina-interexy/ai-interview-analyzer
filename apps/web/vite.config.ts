import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

if (!process.env.VITE_API_URL) {
  console.warn('[vite] WARNING: VITE_API_URL is not set. API calls will use /api fallback which only works in local dev.');
}

export default defineConfig({
  plugins: [react({})],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shared': resolve(__dirname, '../../packages/shared/src'),
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