import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import type { HealthResponse } from '../shared/api.ts';
import {
  StoreError,
  loadBookConfig,
  loadSelectionData,
  saveSelection,
  type StoreDirs,
} from './store.ts';

export const APP_VERSION = '0.3.0';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface ServerOptions {
  logger?: boolean;
  configDir?: string;
  dataDir?: string;
  mediaDir?: string;
}

/** Crea la instancia del servidor sin arrancarla, para poder probarla con `inject`. */
export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 2 * 1024 * 1024 });
  const dirs: StoreDirs = {
    configDir: options.configDir ?? path.join(APP_ROOT, 'config'),
    dataDir: options.dataDir ?? path.join(APP_ROOT, 'data'),
  };
  const mediaDir = options.mediaDir ?? path.join(APP_ROOT, 'media');
  mkdirSync(mediaDir, { recursive: true });

  // Miniaturas y vistas previas generadas por `npm run photos`. Nunca se sirven los originales.
  void app.register(fastifyStatic, {
    root: mediaDir,
    prefix: '/media/',
    maxAge: '1h',
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof StoreError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: 'Error inesperado del servidor local.' });
  });

  app.get('/api/health', (): HealthResponse => ({
    status: 'ok',
    service: 'album-camino',
    version: APP_VERSION,
  }));

  app.get('/api/selection-data', () => loadSelectionData(dirs));

  app.get('/api/book-config', () => loadBookConfig(dirs));

  app.put('/api/selection', async (request) => saveSelection(dirs, request.body));

  return app;
}
