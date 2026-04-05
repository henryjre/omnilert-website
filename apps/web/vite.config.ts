import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const allowedHosts = [
  'omnilert.app',
  'www.omnilert.app',
  'yevette-hydrotropic-pseudoeconomically.ngrok-free.dev',
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts,
  },
  server: {
    port: 5173,
    allowedHosts,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true,
      },
    },
  },
});
