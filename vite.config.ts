import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import path from 'node:path';
import { apiMiddleware } from './server/api.mjs';
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-knowledge-api',
      configureServer(server) {
        server.middlewares.use(apiMiddleware);
      },
    },
  ],
  resolve: { alias: { '@': path.resolve('.') } },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { host: '127.0.0.1', port: 4317, strictPort: true },
  build: { outDir: 'dist' },
});
