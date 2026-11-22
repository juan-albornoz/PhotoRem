import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { API_PORT } from './server/config.ts';

export default defineConfig({
  plugins: [react()],
  server: {
    // IPv4 explícito: en Windows «localhost» puede resolverse solo a ::1 y entonces 127.0.0.1 no responde.
    // Solo se escucha en este equipo; la app no se expone a la red.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${String(API_PORT)}`,
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['server/**/*.test.ts', 'pipeline/**/*.test.ts'],
        },
      },
    ],
  },
});
