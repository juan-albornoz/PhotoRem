import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ExifDateTime, ExifTool, type Tags } from 'exiftool-vendored';

/** Metadatos normalizados de un archivo (foto o vídeo). */
export interface ExifRecord {
  path: string;
  size: number;
  mtimeMs: number;
  model: string | null;
  /** Hora local de captura sin zona: `YYYY-MM-DDTHH:mm:ss.SSS`. */
  local: string | null;
  /** Desfase explícito guardado por el aparato (iPhone). null si no lo hay o no es fiable (Canon). */
  offsetMinutes: number | null;
  gps: { lat: number; lon: number } | null;
  width: number | null;
  height: number | null;
  orientation: number | null;
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

function toNaiveLocal(value: unknown): string | null {
  if (!(value instanceof ExifDateTime)) return null;
  const { year, month, day, hour, minute, second, millisecond } = value;
  if (!year || !month || !day) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(millisecond ?? 0, 3)}`;
}

/** Convierte `+01:00` / `-03:30` en minutos. */
export function parseOffset(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, sign, hh, mm] = m;
  const minutes = Number(hh) * 60 + Number(mm);
  return sign === '-' ? -minutes : minutes;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Normaliza las etiquetas de exiftool. `trustDeviceZone` es false para la Canon. */
export function normalizeTags(
  tags: Tags,
  file: { path: string; size: number; mtimeMs: number },
  trustDeviceZone: boolean,
): ExifRecord {
  const raw = tags as Record<string, unknown>;
  const dateValue = raw.DateTimeOriginal ?? raw.CreationDate ?? raw.CreateDate;
  const local = toNaiveLocal(dateValue);

  let offsetMinutes: number | null = null;
  if (trustDeviceZone) {
    offsetMinutes = parseOffset(raw.OffsetTimeOriginal);
    // Los vídeos del iPhone guardan la zona dentro de CreationDate (QuickTime).
    if (offsetMinutes === null && raw.CreationDate instanceof ExifDateTime) {
      const tz = raw.CreationDate.tzoffsetMinutes;
      if (typeof tz === 'number' && raw.CreationDate.inferredZone !== true) offsetMinutes = tz;
    }
  }

  const lat = toNumber(raw.GPSLatitude);
  const lon = toNumber(raw.GPSLongitude);
  const gps =
    lat !== null && lon !== null && !(lat === 0 && lon === 0) && Math.abs(lat) <= 90
      ? { lat, lon }
      : null;

  return {
    ...file,
    model: typeof raw.Model === 'string' ? raw.Model : null,
    local,
    offsetMinutes,
    gps,
    width: toNumber(raw.ImageWidth),
    height: toNumber(raw.ImageHeight),
    orientation: toNumber(raw.Orientation),
  };
}

type Cache = Record<string, ExifRecord>;

async function loadCache(file: string): Promise<Cache> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Cache;
  } catch {
    return {};
  }
}

/**
 * Lee los metadatos de muchos archivos con exiftool, usando una caché por ruta, tamaño y fecha de modificación.
 * `trustZone(path)` indica si la zona horaria del aparato es fiable para ese archivo.
 */
export async function readExifBatch(
  files: readonly string[],
  cacheFile: string,
  trustZone: (file: string) => boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, ExifRecord>> {
  const cache = await loadCache(cacheFile);
  const result = new Map<string, ExifRecord>();
  const pending: { path: string; size: number; mtimeMs: number }[] = [];

  for (const file of files) {
    const st = await stat(file);
    const cached = cache[file];
    if (cached?.size === st.size && cached.mtimeMs === st.mtimeMs) {
      result.set(file, cached);
    } else {
      pending.push({ path: file, size: st.size, mtimeMs: st.mtimeMs });
    }
  }

  if (pending.length > 0) {
    const tool = new ExifTool({ maxProcs: 6, taskTimeoutMillis: 60_000 });
    try {
      let done = 0;
      const queue = [...pending];
      const workers = Array.from({ length: 6 }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const tags = await tool.read(next.path);
          const record = normalizeTags(tags, next, trustZone(next.path));
          result.set(next.path, record);
          cache[next.path] = record;
          done += 1;
          if (onProgress && done % 100 === 0) onProgress(done, pending.length);
        }
      });
      await Promise.all(workers);
    } finally {
      await tool.end();
    }
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache));
  }

  return result;
}
