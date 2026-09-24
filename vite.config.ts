import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        '@orchestree/ui': path.resolve(import.meta.dirname, 'packages/ui/src/index.ts'),
        '@orchestree/design-tokens': path.resolve(import.meta.dirname, 'packages/design-tokens/src/index.ts'),
        '@orchestree/api-types': path.resolve(import.meta.dirname, 'packages/api-types/src/index.ts'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
          ws: true,
        },
        '/health': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/public': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/openapi.json': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/docs': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/redoc': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/ws': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
          ws: true,
        },
        '/health': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/public': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/openapi.json': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/docs': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/redoc': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/ws': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      sourcemap: false,
    },
  };
});
