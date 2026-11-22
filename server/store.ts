import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { SelectionData } from '../shared/api.ts';
import { BookConfigSchema, type BookConfig } from '../shared/book.ts';
import { PlacesConfigSchema, AlbumConfigSchema } from '../shared/config.ts';
import {
  CandidatesSchema,
  ManifestSchema,
  SelectionSchema,
  type Selection,
} from '../shared/manifest.ts';

/** Acceso a los archivos de `config/` y `data/` del álbum. */

export interface StoreDirs {
  configDir: string;
  dataDir: string;
}

/** Error esperable (faltan datos, selección no válida): se responde con su mensaje. */
export class StoreError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

async function readData(file: string): Promise<unknown> {
  try {
    return await readJson(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new StoreError('Aún no hay fotos procesadas. Ejecuta «npm run photos».', 409);
    }
    throw error;
  }
}

/** Textos, formato y fotos especiales del libro (`config/book.json`). */
export async function loadBookConfig(dirs: StoreDirs): Promise<BookConfig> {
  let raw: unknown;
  try {
    raw = await readJson(path.join(dirs.configDir, 'book.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new StoreError('Falta config/book.json con los textos del libro.', 409);
    }
    throw error;
  }
  const parsed = BookConfigSchema.safeParse(raw);
  if (!parsed.success) throw new StoreError('config/book.json no tiene el formato esperado.', 500);
  return parsed.data;
}

export async function loadSelectionData(dirs: StoreDirs): Promise<SelectionData> {
  const placesConfig = PlacesConfigSchema.parse(
    await readJson(path.join(dirs.configDir, 'places.json')),
  );
  const albumConfig = AlbumConfigSchema.parse(
    await readJson(path.join(dirs.configDir, 'album.config.json')),
  );
  const manifest = ManifestSchema.parse(await readData(path.join(dirs.dataDir, 'manifest.json')));
  const candidates = CandidatesSchema.parse(
    await readData(path.join(dirs.dataDir, 'candidates.json')),
  );
  const selection = SelectionSchema.parse(
    await readData(path.join(dirs.dataDir, 'selection.json')),
  );

  return {
    sections: placesConfig.sections,
    places: placesConfig.places.map(({ id, name, section }) => ({ id, name, section })),
    selectedPerPlace: albumConfig.preselection.selectedPerPlace,
    photos: manifest.photos
      .filter((p): p is typeof p & { placeId: string } => p.placeId !== null)
      .map((p) => ({
        id: p.id,
        placeId: p.placeId,
        localTime: p.localTime,
        source: p.source,
        orientation: p.orientation,
        width: p.width,
        height: p.height,
        inPlace: p.inPlace,
        edited: p.edited,
        clusterId: p.clusterId,
        thumb: p.thumb,
        preview: p.preview,
      })),
    candidates: candidates.places,
    selection,
  };
}

/**
 * Valida y guarda tu selección. Cada foto tiene que existir y ser del lugar donde la pones,
 * sin repetidas y sin pasar del máximo por lugar. Se escribe en un archivo temporal y se renombra,
 * para no dejar nunca un `selection.json` a medias.
 */
export async function saveSelection(dirs: StoreDirs, input: unknown): Promise<Selection> {
  const parsed = SelectionSchema.safeParse(input);
  if (!parsed.success) throw new StoreError('La selección no tiene el formato esperado.', 400);
  const data = await loadSelectionData(dirs);
  const placeOf = new Map(data.photos.map((p) => [p.id, p.placeId]));
  const names = new Map(data.places.map((p) => [p.id, p.name]));

  for (const [placeId, ids] of Object.entries(parsed.data.places)) {
    const name = names.get(placeId);
    if (!name) throw new StoreError(`Lugar desconocido: ${placeId}`, 400);
    if (new Set(ids).size !== ids.length)
      throw new StoreError(`Hay fotos repetidas en ${name}.`, 400);
    if (ids.length > data.selectedPerPlace) {
      throw new StoreError(
        `En ${name} hay ${String(ids.length)} fotos; el máximo es ${String(data.selectedPerPlace)}.`,
        400,
      );
    }
    for (const id of ids) {
      if (placeOf.get(id) !== placeId) throw new StoreError(`La foto ${id} no es de ${name}.`, 400);
    }
  }

  const saved: Selection = { ...parsed.data, updatedAt: new Date().toISOString() };
  const file = path.join(dirs.dataDir, 'selection.json');
  const tmp = `${file}.${String(process.pid)}.tmp`;
  await writeFile(tmp, JSON.stringify(saved, null, 2));
  await rename(tmp, file);
  return saved;
}
