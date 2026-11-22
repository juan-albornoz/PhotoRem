import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SelectionDataSchema, isHealthResponse } from '../shared/api.ts';
import { BookConfigSchema } from '../shared/book.ts';
import type { ManifestPhoto } from '../shared/manifest.ts';
import { bookConfigFixture } from '../src/test/fixtures.ts';
import { APP_VERSION, buildServer } from './app.ts';

function photo(id: string, placeId: string, minute: number): ManifestPhoto {
  return {
    id,
    source: 'iphone',
    file: `../Telefono/${id}.DNG`,
    related: [],
    edited: false,
    takenAt: `2026-10-06T08:${String(minute).padStart(2, '0')}:00.000Z`,
    localTime: `2026-10-06T10:${String(minute).padStart(2, '0')}:00`,
    gps: { lat: 42.3, lon: -3.7, approx: false },
    placeId,
    distanceToPlaceKm: 0.5,
    inPlace: true,
    width: 4032,
    height: 3024,
    orientation: 'landscape',
    megapixels: 12.2,
    quality: {
      sharpness: 100,
      focus: 1000,
      exposureMean: 120,
      clippedHigh: 0,
      clippedLow: 0,
      phash: '0123456789abcdef',
      blurry: false,
    },
    clusterId: id,
    thumb: `/media/thumbs/${id}.jpg`,
    preview: `/media/preview/${id}.jpg`,
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(value));
}

describe('servidor local', () => {
  let root: string;
  let dirs: { configDir: string; dataDir: string; mediaDir: string };
  let app: FastifyInstance;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'album-test-'));
    dirs = {
      configDir: path.join(root, 'config'),
      dataDir: path.join(root, 'data'),
      mediaDir: path.join(root, 'media'),
    };
    await mkdir(dirs.configDir, { recursive: true });
    await mkdir(dirs.dataDir, { recursive: true });
    await mkdir(path.join(dirs.mediaDir, 'thumbs'), { recursive: true });
    await writeJson(path.join(dirs.configDir, 'places.json'), {
      sections: [{ id: 'camino', title: 'Camino Francés' }],
      places: [
        { id: 'burgos', name: 'Burgos', section: 'camino', lat: 42.34, lon: -3.7, radiusKm: 3 },
        { id: 'leon', name: 'León', section: 'camino', lat: 42.6, lon: -5.57, radiusKm: 3 },
      ],
    });
    await writeJson(path.join(dirs.configDir, 'album.config.json'), {
      sources: { canon: '../Canon', iphone: '../Telefono' },
      timeZone: 'Europe/Madrid',
      canonClockCorrectionSeconds: 48,
      preselection: { candidatesPerPlace: 3, selectedPerPlace: 2, minFocus: 5 },
    });
    app = buildServer(dirs);
  });

  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  async function writeData(): Promise<void> {
    await writeJson(path.join(dirs.dataDir, 'manifest.json'), {
      version: 1,
      generatedAt: '2026-11-22T00:00:00.000Z',
      canonClockCorrectionSeconds: 48,
      arrivals: [],
      photos: [
        photo('b1', 'burgos', 1),
        photo('b2', 'burgos', 2),
        photo('b3', 'burgos', 3),
        photo('l1', 'leon', 4),
      ],
    });
    await writeJson(path.join(dirs.dataDir, 'candidates.json'), {
      version: 1,
      generatedAt: '2026-11-22T00:00:00.000Z',
      selectedPerPlace: 2,
      places: [
        { placeId: 'burgos', total: 3, candidates: ['b1', 'b2', 'b3'], suggested: ['b1', 'b2'] },
        { placeId: 'leon', total: 1, candidates: ['l1'], suggested: ['l1'] },
      ],
    });
    await writeJson(path.join(dirs.dataDir, 'selection.json'), {
      version: 1,
      updatedAt: '2026-11-22T00:00:00.000Z',
      places: { burgos: ['b1', 'b2'], leon: ['l1'] },
    });
  }

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

  it('avisa con un mensaje claro si aún no se procesaron las fotos', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/selection-data' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'Aún no hay fotos procesadas. Ejecuta «npm run photos».',
    });
  });

  it('entrega lugares, fotos, candidatas y selección con el contrato compartido', async () => {
    await writeData();
    const response = await app.inject({ method: 'GET', url: '/api/selection-data' });
    expect(response.statusCode).toBe(200);
    const data = SelectionDataSchema.parse(response.json());
    expect(data.places.map((p) => p.name)).toEqual(['Burgos', 'León']);
    expect(data.selectedPerPlace).toBe(2);
    expect(data.photos).toHaveLength(4);
    expect(data.photos[0]).not.toHaveProperty('file'); // nunca se expone la ruta de los originales
    expect(data.selection.places.burgos).toEqual(['b1', 'b2']);
  });

  it('guarda una selección válida de forma atómica', async () => {
    await writeData();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/selection',
      payload: { version: 1, updatedAt: 'x', places: { burgos: ['b3'], leon: [] } },
    });
    expect(response.statusCode).toBe(200);
    const saved = JSON.parse(await readFile(path.join(dirs.dataDir, 'selection.json'), 'utf8')) as {
      updatedAt: string;
      places: Record<string, string[]>;
    };
    expect(saved.places).toEqual({ burgos: ['b3'], leon: [] });
    expect(saved.updatedAt).not.toBe('x'); // la fecha la pone el servidor
  });

  it.each([
    [{ version: 1, updatedAt: 'x', places: { burgos: ['l1'] } }, 'La foto l1 no es de Burgos.'],
    [
      { version: 1, updatedAt: 'x', places: { burgos: ['b1', 'b2', 'b3'] } },
      'En Burgos hay 3 fotos; el máximo es 2.',
    ],
    [
      { version: 1, updatedAt: 'x', places: { burgos: ['b1', 'b1'] } },
      'Hay fotos repetidas en Burgos.',
    ],
    [{ version: 1, updatedAt: 'x', places: { roma: [] } }, 'Lugar desconocido: roma'],
    [{ places: 'nada' }, 'La selección no tiene el formato esperado.'],
  ])('rechaza una selección no válida (%#)', async (payload, message) => {
    await writeData();
    const before = await readFile(path.join(dirs.dataDir, 'selection.json'), 'utf8');
    const response = await app.inject({ method: 'PUT', url: '/api/selection', payload });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: message });
    expect(await readFile(path.join(dirs.dataDir, 'selection.json'), 'utf8')).toBe(before);
  });

  it('entrega los textos del libro validados', async () => {
    await writeJson(path.join(dirs.configDir, 'book.json'), bookConfigFixture());
    const response = await app.inject({ method: 'GET', url: '/api/book-config' });
    expect(response.statusCode).toBe(200);
    expect(BookConfigSchema.parse(response.json()).meta.title).toBe('Camino Francés');
  });

  it('avisa si falta config/book.json', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/book-config' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'Falta config/book.json con los textos del libro.' });
  });

  it('rechaza un config/book.json con formato incorrecto', async () => {
    await writeJson(path.join(dirs.configDir, 'book.json'), { meta: 'nada' });
    const response = await app.inject({ method: 'GET', url: '/api/book-config' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'config/book.json no tiene el formato esperado.' });
  });

  it('incluye el grupo de ráfaga de cada foto para evitar repeticiones en el libro', async () => {
    await writeData();
    const response = await app.inject({ method: 'GET', url: '/api/selection-data' });
    const data = SelectionDataSchema.parse(response.json());
    expect(data.photos[0]?.clusterId).toBe('b1');
  });
  it('sirve las miniaturas generadas', async () => {
    await writeFile(path.join(dirs.mediaDir, 'thumbs', 'b1.jpg'), 'jpeg');
    const response = await app.inject({ method: 'GET', url: '/media/thumbs/b1.jpg' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('jpeg');
  });

  it('no permite salir de la carpeta de miniaturas', async () => {
    const response = await app.inject({ method: 'GET', url: '/media/../config/places.json' });
    expect(response.statusCode).toBe(404);
  });
});
