import { execFile } from 'node:child_process';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import sharp from 'sharp';

import {
  exposureStats,
  focusScore,
  laplacianVariance,
  luminance,
  phashFromGray32,
} from './quality.ts';

const execFileAsync = promisify(execFile);

export interface Analysis {
  /** Dimensiones del archivo principal, ya giradas según su orientación. */
  width: number;
  height: number;
  sharpness: number;
  focus: number;
  exposureMean: number;
  clippedHigh: number;
  clippedLow: number;
  phash: string;
}

/** Tamaños de las versiones derivadas (lado mayor, en píxeles). */
export const THUMB_PX = 480;
export const PREVIEW_PX = 1600;

/** Nombre de archivo de las versiones derivadas a partir del id de la foto. */
export function assetName(id: string): string {
  return `${id.replaceAll('/', '__')}.jpg`;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** sharp no decodifica HEIC (HEVC): se convierte una vez a JPEG con ffmpeg y se guarda en caché. */
export async function decodableInput(master: string, heicCacheDir: string): Promise<string> {
  if (!/\.heic$/i.test(master)) return master;
  const out = path.join(heicCacheDir, `${path.basename(master, path.extname(master))}.jpg`);
  if (!(await exists(out))) {
    await mkdir(heicCacheDir, { recursive: true });
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      master,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      out,
    ]);
  }
  return out;
}

/** Analiza una foto y escribe su miniatura y su vista previa. Decodifica el original una sola vez. */
export async function analyzeImage(
  input: string,
  outputs: { thumb: string; preview: string },
): Promise<Analysis> {
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;

  const { data, info } = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: PREVIEW_PX, height: PREVIEW_PX, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };

  await Promise.all([
    sharp(data, raw).jpeg({ quality: 82, mozjpeg: true }).toFile(outputs.preview),
    sharp(data, raw)
      .resize({ width: THUMB_PX, height: THUMB_PX, fit: 'inside' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(outputs.thumb),
  ]);

  const gray = luminance(data, info.channels);
  const gray32 = await sharp(Buffer.from(gray), {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .resize(32, 32, { fit: 'fill' })
    // sharp devuelve RGB aunque la entrada sea de un canal: nos quedamos con uno solo (1024 valores).
    .extractChannel(0)
    .raw()
    .toBuffer();
  const exposure = exposureStats(gray);

  return {
    width,
    height,
    sharpness: laplacianVariance(gray, info.width, info.height),
    focus: focusScore(gray, info.width, info.height),
    exposureMean: exposure.mean,
    clippedHigh: exposure.clippedHigh,
    clippedLow: exposure.clippedLow,
    phash: phashFromGray32(new Uint8Array(gray32)),
  };
}

type AnalysisCache = Record<string, Analysis & { size: number; mtimeMs: number }>;

/**
 * Analiza todas las fotos en paralelo con caché (por ruta, tamaño y fecha). Si falta una versión
 * derivada, se vuelve a generar.
 */
export async function analyzeAll(
  items: readonly { id: string; master: string }[],
  dirs: { thumbs: string; previews: string; cacheFile: string; heicCache: string },
  onProgress?: (done: number, total: number) => void,
): Promise<{ results: Map<string, Analysis>; failures: { id: string; error: string }[] }> {
  await mkdir(dirs.thumbs, { recursive: true });
  await mkdir(dirs.previews, { recursive: true });
  let cache: AnalysisCache = {};
  try {
    cache = JSON.parse(await readFile(dirs.cacheFile, 'utf8')) as AnalysisCache;
  } catch {
    cache = {};
  }

  const results = new Map<string, Analysis>();
  const failures: { id: string; error: string }[] = [];
  const queue = [...items];
  let done = 0;
  let sinceSave = 0;

  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const thumb = path.join(dirs.thumbs, assetName(item.id));
      const preview = path.join(dirs.previews, assetName(item.id));
      try {
        const st = await stat(item.master);
        const cached = cache[item.master];
        if (
          cached?.size === st.size &&
          cached.mtimeMs === st.mtimeMs &&
          (await exists(thumb)) &&
          (await exists(preview))
        ) {
          results.set(item.id, cached);
        } else {
          const input = await decodableInput(item.master, dirs.heicCache);
          const analysis = await analyzeImage(input, { thumb, preview });
          results.set(item.id, analysis);
          cache[item.master] = { ...analysis, size: st.size, mtimeMs: st.mtimeMs };
          sinceSave += 1;
        }
      } catch (error) {
        failures.push({
          id: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      done += 1;
      if (onProgress && done % 100 === 0) onProgress(done, items.length);
      if (sinceSave >= 100) {
        sinceSave = 0;
        await writeFile(dirs.cacheFile, JSON.stringify(cache));
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  await mkdir(path.dirname(dirs.cacheFile), { recursive: true });
  await writeFile(dirs.cacheFile, JSON.stringify(cache));
  return { results, failures };
}
