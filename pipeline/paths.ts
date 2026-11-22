import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AlbumConfigSchema,
  CurationSchema,
  PlacesConfigSchema,
  type AlbumConfig,
  type Curation,
  type PlacesConfig,
} from '../shared/config.ts';

/** Carpeta raíz de la app (`album/`). */
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_DIR = path.join(APP_ROOT, 'config');
export const DATA_DIR = path.join(APP_ROOT, 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const MEDIA_DIR = path.join(APP_ROOT, 'media');

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

export async function loadAlbumConfig(): Promise<AlbumConfig> {
  return AlbumConfigSchema.parse(await readJson(path.join(CONFIG_DIR, 'album.config.json')));
}

export async function loadPlacesConfig(): Promise<PlacesConfig> {
  return PlacesConfigSchema.parse(await readJson(path.join(CONFIG_DIR, 'places.json')));
}

/** Ajustes manuales a la sugerencia. El archivo es opcional. */
export async function loadCuration(): Promise<Curation> {
  try {
    return CurationSchema.parse(await readJson(path.join(CONFIG_DIR, 'curation.json')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

/** Ruta absoluta de una carpeta de origen configurada de forma relativa a `album/`. */
export function resolveSource(relative: string): string {
  return path.resolve(APP_ROOT, relative);
}
