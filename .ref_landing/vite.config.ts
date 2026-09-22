import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  define: {
    'process.env.NEXT_PUBLIC_BACKEND_API_URL': JSON.stringify(
      process.env.NEXT_PUBLIC_BACKEND_API_URL ||
      process.env.VITE_BACKEND_API_URL ||
      'https://api.orchestree.biz.id/api/v1'
    ),
    'process.env.BACKEND_API_URL': JSON.stringify(
      process.env.NEXT_PUBLIC_BACKEND_API_URL ||
      process.env.VITE_BACKEND_API_URL ||
      'https://api.orchestree.biz.id/api/v1'
    ),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
});
