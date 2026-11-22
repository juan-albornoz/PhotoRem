import Fastify, { type FastifyInstance } from 'fastify';

import type { HealthResponse } from '../shared/api.ts';

export const APP_VERSION = '0.1.0';

/** Crea la instancia del servidor sin arrancarla, para poder probarla con `inject`. */
export function buildServer(options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/api/health', (): HealthResponse => ({
    status: 'ok',
    service: 'album-camino',
    version: APP_VERSION,
  }));

  return app;
}
