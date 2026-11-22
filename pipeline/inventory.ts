import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Inventario de originales. Agrupa los archivos de cada toma (JPG + CR2 de la Canon;
 * DNG/JPG/HEIC/versión editada del iPhone) y decide cuál se usa para el álbum.
 * Solo lee nombres de archivo: nunca modifica los originales.
 */

export type SourceKind = 'canon' | 'iphone';

export interface PhotoItem {
  /** Identificador estable: `canon/100CANON/_MG_9800` o `iphone/IMG_4319`. */
  id: string;
  source: SourceKind;
  /** Archivo del que se sacan las imágenes del álbum. */
  master: string;
  /** Resto de archivos de la misma toma (RAW, original sin editar…). */
  related: string[];
  /** El archivo principal es una versión editada por ti en el iPhone. */
  edited: boolean;
}

export interface Inventory {
  photos: PhotoItem[];
  /** Vídeos del iPhone: no van al álbum, pero su GPS ayuda a reconstruir el recorrido. */
  videos: string[];
  /** Archivos que no se usan (capturas de pantalla, recibidos, datos de edición…). */
  ignored: string[];
}

const IPHONE_NAME = /^IMG_(E)?(\d{4})\.([A-Z0-9]+)$/i;
const IPHONE_PHOTO_EXT = ['JPG', 'JPEG', 'HEIC', 'DNG'] as const;
const VIDEO_EXT = new Set(['MOV', 'MP4']);
/** Preferencia del archivo principal de una toma del iPhone (de más a menos preferido). */
const IPHONE_MASTER_RANK: Record<string, number> = { JPG: 0, JPEG: 0, HEIC: 1, DNG: 2 };

interface ParsedIphoneName {
  number: string;
  edited: boolean;
  ext: string;
}

export function parseIphoneName(name: string): ParsedIphoneName | null {
  const match = IPHONE_NAME.exec(name);
  if (!match) return null;
  const [, edited, number, ext] = match;
  if (number === undefined || ext === undefined) return null;
  return { number, edited: edited !== undefined, ext: ext.toUpperCase() };
}

function isIphonePhotoExt(ext: string): boolean {
  return (IPHONE_PHOTO_EXT as readonly string[]).includes(ext);
}

/** Agrupa los nombres de una carpeta del iPhone en tomas, vídeos e ignorados. */
export function groupIphoneFiles(names: readonly string[]): {
  photos: { number: string; master: string; related: string[]; edited: boolean }[];
  videos: string[];
  ignored: string[];
} {
  const byNumber = new Map<string, { name: string; parsed: ParsedIphoneName }[]>();
  const videos: string[] = [];
  const ignored: string[] = [];

  for (const name of names) {
    const parsed = parseIphoneName(name);
    if (!parsed) {
      ignored.push(name); // recibidos por WhatsApp u otras apps, IMG_A….DAT, etc.
      continue;
    }
    if (VIDEO_EXT.has(parsed.ext)) {
      videos.push(name);
      continue;
    }
    if (!isIphonePhotoExt(parsed.ext)) {
      ignored.push(name); // PNG (capturas), AAE (ajustes)
      continue;
    }
    const group = byNumber.get(parsed.number) ?? [];
    group.push({ name, parsed });
    byNumber.set(parsed.number, group);
  }

  const photos = [...byNumber.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([number, files]) => {
      const sorted = [...files].sort((a, b) => {
        // Primero tu versión editada; después JPG > HEIC > DNG.
        if (a.parsed.edited !== b.parsed.edited) return a.parsed.edited ? -1 : 1;
        return (IPHONE_MASTER_RANK[a.parsed.ext] ?? 9) - (IPHONE_MASTER_RANK[b.parsed.ext] ?? 9);
      });
      const [master, ...rest] = sorted;
      if (!master) throw new Error(`Grupo vacío para IMG_${number}`);
      return {
        number,
        master: master.name,
        related: rest.map((f) => f.name).sort(),
        edited: master.parsed.edited,
      };
    });

  return { photos, videos: videos.sort(), ignored: ignored.sort() };
}

const CANON_JPG = /^(_MG_|IMG_)\d{4}\.JPG$/i;

/** Agrupa los nombres de una carpeta DCIM de la Canon: el JPG es el principal y el CR2 va como relacionado. */
export function groupCanonFiles(names: readonly string[]): {
  photos: { base: string; master: string; related: string[] }[];
  ignored: string[];
} {
  const set = new Set(names.map((n) => n.toUpperCase()));
  const photos: { base: string; master: string; related: string[] }[] = [];
  const ignored: string[] = [];
  for (const name of [...names].sort()) {
    if (CANON_JPG.test(name)) {
      const base = name.slice(0, -4);
      const raw = names.find((n) => n.toUpperCase() === `${base.toUpperCase()}.CR2`);
      photos.push({ base, master: name, related: raw ? [raw] : [] });
    } else if (!(
      name.toUpperCase().endsWith('.CR2') && set.has(`${name.slice(0, -4).toUpperCase()}.JPG`)
    )) {
      ignored.push(name);
    }
  }
  return { photos, ignored };
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

async function listDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export async function buildInventory(canonDir: string, iphoneDir: string): Promise<Inventory> {
  const photos: PhotoItem[] = [];
  const ignored: string[] = [];

  for (const sub of await listDirs(canonDir)) {
    const dir = path.join(canonDir, sub);
    const grouped = groupCanonFiles(await listFiles(dir));
    for (const p of grouped.photos) {
      photos.push({
        id: `canon/${sub}/${p.base}`,
        source: 'canon',
        master: path.join(dir, p.master),
        related: p.related.map((r) => path.join(dir, r)),
        edited: false,
      });
    }
    ignored.push(...grouped.ignored.map((n) => path.join(dir, n)));
  }

  const iphone = groupIphoneFiles(await listFiles(iphoneDir));
  for (const p of iphone.photos) {
    photos.push({
      id: `iphone/IMG_${p.number}`,
      source: 'iphone',
      master: path.join(iphoneDir, p.master),
      related: p.related.map((r) => path.join(iphoneDir, r)),
      edited: p.edited,
    });
  }
  ignored.push(...iphone.ignored.map((n) => path.join(iphoneDir, n)));

  return { photos, videos: iphone.videos.map((n) => path.join(iphoneDir, n)), ignored };
}
