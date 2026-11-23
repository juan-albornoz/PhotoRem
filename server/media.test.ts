import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LayoutOverridesSchema, pageSignature } from '../shared/book.ts';
import { buildServer } from './app.ts';
import { coverCrop } from './images.ts';
import type { PdfExporter } from './pdf.ts';

/** Servidor con una foto real de 600×400 en una carpeta temporal (no usa tus fotos). */
describe('servidor: imágenes del libro, orden de fotos y PDF', () => {
  let root: string;
  let app: FastifyInstance;
  let exporter: ReturnType<typeof vi.fn<PdfExporter>>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'album-media-'));
    await mkdir(path.join(root, 'data'), { recursive: true });
    await mkdir(path.join(root, 'photos'), { recursive: true });
    await sharp({ create: { width: 600, height: 400, channels: 3, background: '#4a7' } })
      .jpeg()
      .toFile(path.join(root, 'photos', 'b1.jpg'));
    await writeFile(
      path.join(root, 'data', 'manifest.json'),
      JSON.stringify({
        version: 1,
        generatedAt: '2026-11-22T00:00:00.000Z',
        canonClockCorrectionSeconds: 48,
        arrivals: [],
        photos: [
          {
            id: 'iphone/b1',
            source: 'iphone',
            file: 'photos/b1.jpg',
            related: [],
            edited: false,
            takenAt: '2026-10-06T08:00:00.000Z',
            localTime: '2026-10-06T10:00:00',
            gps: null,
            placeId: 'burgos',
            distanceToPlaceKm: null,
            inPlace: false,
            width: 600,
            height: 400,
            orientation: 'landscape',
            megapixels: 0.2,
            quality: {
              sharpness: 1,
              focus: 1,
              exposureMean: 120,
              clippedHigh: 0,
              clippedLow: 0,
              phash: '0123456789abcdef',
              blurry: false,
            },
            clusterId: 'iphone/b1',
            thumb: '/media/thumbs/iphone__b1.jpg',
            preview: '/media/preview/iphone__b1.jpg',
          },
        ],
      }),
    );
    exporter = vi.fn<PdfExporter>(() => Promise.resolve(Buffer.from('%PDF-1.7 prueba')));
    app = buildServer({ appRoot: root, exporter, webOrigin: 'http://web.test' });
  });

  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  const id = encodeURIComponent('iphone/b1');

  it('sirve la foto a un ancho de la lista sin ampliarla nunca', async () => {
    const response = await app.inject({ url: `/api/image?id=${id}&w=800` });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(response.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([600, 400]); // la original mide 600: no se amplía
    // La segunda vez sale de la caché.
    expect((await app.inject({ url: `/api/image?id=${id}&w=800` })).statusCode).toBe(200);
  });

  it('rechaza anchos fuera de la lista y fotos desconocidas', async () => {
    expect((await app.inject({ url: `/api/image?id=${id}&w=1234` })).statusCode).toBe(400);
    const unknown = await app.inject({ url: '/api/image?id=..%2F..%2Fsecreto&w=800' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: 'Foto desconocida: ../../secreto' });
  });

  it('recorta la foto exactamente al hueco y al ancho pedido', async () => {
    const response = await app.inject({
      url: `/api/image/crop?id=${id}&aspect=1&cx=0.5&cy=0.5&scale=1&w=300`,
    });
    expect(response.statusCode).toBe(200);
    const meta = await sharp(response.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([300, 300]);
  });

  it('el recorte tampoco amplía: si pides más píxeles de los que hay, da los que hay', async () => {
    const response = await app.inject({ url: `/api/image/crop?id=${id}&aspect=1&w=5000` });
    const meta = await sharp(response.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([400, 400]);
  });

  it('rechaza parámetros de recorte absurdos', async () => {
    expect((await app.inject({ url: `/api/image/crop?id=${id}&aspect=0&w=300` })).statusCode).toBe(
      400,
    );
    expect(
      (await app.inject({ url: `/api/image/crop?id=${id}&aspect=1&scale=0.5&w=300` })).statusCode,
    ).toBe(400);
  });

  it('calcula el encuadre como «cubrir», respetando el centro y sin salirse de la foto', () => {
    expect(
      coverCrop({ width: 600, height: 400 }, { aspect: 1, centerX: 0.5, centerY: 0.5, scale: 1 }),
    ).toEqual({
      left: 100,
      top: 0,
      width: 400,
      height: 400,
    });
    // Centro pegado al borde: el recorte se ajusta para no salirse.
    expect(
      coverCrop({ width: 600, height: 400 }, { aspect: 1, centerX: 1, centerY: 0.5, scale: 2 }),
    ).toEqual({
      left: 400,
      top: 100,
      width: 200,
      height: 200,
    });
  });

  it('guarda y devuelve tu orden de fotos por página', async () => {
    const empty = LayoutOverridesSchema.parse((await app.inject({ url: '/api/layout' })).json());
    expect(empty.pages).toEqual({});
    const order = ['b', 'a', 'c'];
    const put = await app.inject({
      method: 'PUT',
      url: '/api/layout',
      payload: {
        version: 1,
        updatedAt: 'x',
        pages: { [pageSignature(order)]: { templateId: 'trio-band', order } },
      },
    });
    expect(put.statusCode).toBe(200);
    const saved = LayoutOverridesSchema.parse((await app.inject({ url: '/api/layout' })).json());
    expect(saved.pages['a|b|c']).toEqual({ templateId: 'trio-band', order });
  });

  it('rechaza un orden que no coincide con las fotos de su página', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/layout',
      payload: {
        version: 1,
        updatedAt: 'x',
        pages: { 'a|b': { templateId: 'two-stack', order: ['a', 'z'] } },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Un orden no coincide con las fotos de su página.' });
  });

  it('genera el PDF con la página de impresión de la app y lo descarga', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/export/pdf',
      payload: { quality: 'print' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="camino-frances-imprenta.pdf"',
    );
    expect(response.body).toBe('%PDF-1.7 prueba');
    expect(exporter).toHaveBeenCalledWith('http://web.test', 'print');
  });

  it('rechaza una calidad desconocida y avisa si el PDF falla', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/api/export/pdf', payload: { quality: 'max' } }))
        .statusCode,
    ).toBe(400);
    exporter.mockRejectedValueOnce(new Error('Chromium no arrancó'));
    const failed = await app.inject({
      method: 'POST',
      url: '/api/export/pdf',
      payload: { quality: 'light' },
    });
    expect(failed.statusCode).toBe(500);
    // Tras un fallo se puede volver a intentar (no queda bloqueado).
    expect(
      (await app.inject({ method: 'POST', url: '/api/export/pdf', payload: { quality: 'light' } }))
        .statusCode,
    ).toBe(200);
  });
});
