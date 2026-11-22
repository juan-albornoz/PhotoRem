import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isHealthResponse } from '../shared/api.ts';
import { APP_VERSION, buildServer } from './app.ts';

describe('servidor local', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responde al chequeo de salud con el contrato compartido', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    const body: unknown = response.json();

    expect(response.statusCode).toBe(200);
    expect(isHealthResponse(body)).toBe(true);
    expect(body).toEqual({ status: 'ok', service: 'album-camino', version: APP_VERSION });
  });

  it('devuelve 404 en rutas desconocidas', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/no-existe' });

    expect(response.statusCode).toBe(404);
  });
});
