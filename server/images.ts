import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { SCREEN_WIDTHS } from '../shared/images.ts';
import { ManifestSchema, type Manifest } from '../shared/manifest.ts';
import { decodableInput, assetName } from '../pipeline/analyze.ts';
import { StoreError } from './store.ts';

/**
 * Imágenes del libro a la resolución que se necesita, generadas desde los originales (JPG de la Canon,
 * JPEG completo del DNG del iPhone…) y guardadas en caché. Nunca se amplía una foto por encima de su
 * tamaño real, y solo se sirven fotos del manifiesto.
 */

/** Anchos para pantalla (srcset): lista cerrada para que la caché no crezca sin control. */
export { SCREEN_WIDTHS };

export interface ImageDirs {
  appRoot: string;
  dataDir: string;
  mediaDir: string;
}

let manifestCache: { mtimeMs: number; byId: Map<string, Manifest['photos'][number]> } | null = null;

async function photoById(dirs: ImageDirs, id: string): Promise<Manifest['photos'][number]> {
  const file = path.join(dirs.dataDir, 'manifest.json');
  const st = await stat(file).catch(() => null);
  if (!st) throw new StoreError('Aún no hay fotos procesadas. Ejecuta «npm run photos».', 409);
  if (manifestCache?.mtimeMs !== st.mtimeMs) {
    const manifest = ManifestSchema.parse(JSON.parse(await readFile(file, 'utf8')) as unknown);
    manifestCache = { mtimeMs: st.mtimeMs, byId: new Map(manifest.photos.map((p) => [p.id, p])) };
  }
  const photo = manifestCache.byId.get(id);
  if (!photo) throw new StoreError(`Foto desconocida: ${id}`, 404);
  return photo;
}

/** Archivo del que se lee la foto (HEIC → JPEG en caché, porque sharp no decodifica HEVC). */
async function masterFile(dirs: ImageDirs, photo: Manifest['photos'][number]): Promise<string> {
  const file = path.resolve(dirs.appRoot, photo.file);
  return decodableInput(file, path.join(dirs.dataDir, 'cache', 'heic'));
}

/** Genera `target` con `render` si no existe todavía (escribe en temporal y renombra: nunca a medias). */
async function cached(target: string, render: (tmp: string) => Promise<unknown>): Promise<string> {
  if (await stat(target).catch(() => null)) return target;
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${String(process.pid)}.${String(Date.now())}.tmp`;
  await render(tmp);
  await rename(tmp, target);
  return target;
}

/** Foto completa a `width` px de ancho como máximo (lado mayor), para pantalla. */
export async function sizedImage(dirs: ImageDirs, id: string, width: number): Promise<string> {
  if (!(SCREEN_WIDTHS as readonly number[]).includes(width)) {
    throw new StoreError(`Ancho no permitido: ${String(width)}`, 400);
  }
  const photo = await photoById(dirs, id);
  const target = path.join(dirs.mediaDir, 'sized', `w${String(width)}`, assetName(id));
  return cached(target, async (tmp) => {
    const input = await masterFile(dirs, photo);
    await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(tmp);
  });
}

export interface CropRequest {
  id: string;
  /** Proporción ancho/alto del hueco. */
  aspect: number;
  /** Centro del encuadre (0–1) y zoom (≥ 1), como en el modelo del libro. */
  centerX: number;
  centerY: number;
  scale: number;
  /** Ancho de salida deseado en px (para 300 ppp: mm ÷ 25,4 × 300). */
  width: number;
}

/** Región de la foto que llena un hueco de proporción `aspect` sin deformarla (como `object-fit: cover`). */
export function coverCrop(
  photo: { width: number; height: number },
  request: Pick<CropRequest, 'aspect' | 'centerX' | 'centerY' | 'scale'>,
): { left: number; top: number; width: number; height: number } {
  const { width: W, height: H } = photo;
  let cw = W / H > request.aspect ? H * request.aspect : W;
  let ch = cw / request.aspect;
  cw /= request.scale;
  ch /= request.scale;
  const left = Math.min(Math.max(request.centerX * W - cw / 2, 0), W - cw);
  const top = Math.min(Math.max(request.centerY * H - ch / 2, 0), H - ch);
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(1, Math.min(W, Math.round(cw))),
    height: Math.max(1, Math.min(H, Math.round(ch))),
  };
}

/** Foto recortada exactamente al hueco (encuadre aplicado) y al ancho pedido, sin ampliar nunca. */
export async function croppedImage(dirs: ImageDirs, request: CropRequest): Promise<string> {
  const { aspect, centerX, centerY, scale, width } = request;
  const valid =
    aspect > 0.05 &&
    aspect < 20 &&
    centerX >= 0 &&
    centerX <= 1 &&
    centerY >= 0 &&
    centerY <= 1 &&
    scale >= 1 &&
    scale <= 8 &&
    Number.isInteger(width) &&
    width >= 64 &&
    width <= 8000;
  if (!valid) throw new StoreError('Parámetros de recorte no válidos.', 400);
  const photo = await photoById(dirs, request.id);
  const region = coverCrop(photo, request);
  const outWidth = Math.min(width, region.width);
  const key = [
    aspect.toFixed(4),
    centerX.toFixed(3),
    centerY.toFixed(3),
    scale.toFixed(3),
    String(outWidth),
  ].join('_');
  const target = path.join(
    dirs.mediaDir,
    'crops',
    `${assetName(request.id).slice(0, -4)}__${key}.jpg`,
  );
  return cached(target, async (tmp) => {
    const input = await masterFile(dirs, photo);
    await sharp(input, { failOn: 'none' })
      .rotate()
      .extract(region)
      .resize({ width: outWidth, height: Math.max(1, Math.round(outWidth / aspect)), fit: 'fill' })
      .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toFile(tmp);
  });
}
