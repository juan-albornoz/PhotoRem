import type { Place } from '../shared/config.ts';
import type { ExifRecord } from './exif.ts';
import { buildTrack, locateAt, type Fix, type Located } from './geo.ts';
import type { Inventory, PhotoItem } from './inventory.ts';
import { assignPlace, computeArrivals, tripEnd, type Arrival } from './places.ts';
import { captureUtc } from './time.ts';

/** Una foto situada en el tiempo y en el recorrido. */
export interface TimedPhoto {
  item: PhotoItem;
  exif: ExifRecord;
  /** Instante UTC (ms). */
  t: number;
  /** GPS propio (iPhone) o estimado con el recorrido (Canon). */
  gps: Located | null;
  placeId: string | null;
}

export interface Timeline {
  track: Fix[];
  arrivals: Arrival[];
  endT: number;
  photos: TimedPhoto[];
  /** Fotos sin hora o sin modelo de cámara (capturas, imágenes guardadas): no entran al álbum. */
  rejected: { item: PhotoItem; reason: string }[];
}

export function buildTimeline(
  inventory: Inventory,
  exif: ReadonlyMap<string, ExifRecord>,
  places: readonly Place[],
  timeZone: string,
  canonCorrectionSeconds: number,
): Timeline {
  const fixes: Fix[] = [];
  const iphoneMedia = [
    ...inventory.photos.filter((p) => p.source === 'iphone').map((p) => p.master),
    ...inventory.videos,
  ];
  for (const file of iphoneMedia) {
    const record = exif.get(file);
    if (!record?.gps) continue;
    const t = captureUtc(record, 'iphone', timeZone, canonCorrectionSeconds);
    if (t !== null) fixes.push({ t, ...record.gps });
  }
  const track = buildTrack(fixes);
  const arrivals = computeArrivals(places, track);
  const lastPlace = places.at(-1);
  if (!lastPlace) throw new Error('No hay lugares configurados');
  const endT = tripEnd(lastPlace, track);

  const photos: TimedPhoto[] = [];
  const rejected: Timeline['rejected'] = [];
  for (const item of inventory.photos) {
    const record = exif.get(item.master);
    if (!record) {
      rejected.push({ item, reason: 'sin metadatos' });
      continue;
    }
    if (record.model === null) {
      rejected.push({ item, reason: 'sin modelo de cámara (captura o imagen guardada)' });
      continue;
    }
    const t = captureUtc(record, item.source, timeZone, canonCorrectionSeconds);
    if (t === null) {
      rejected.push({ item, reason: 'sin fecha de captura' });
      continue;
    }
    const gps: Located | null = record.gps ? { ...record.gps, approx: false } : locateAt(track, t);
    photos.push({ item, exif: record, t, gps, placeId: assignPlace(arrivals, t, endT) });
  }
  photos.sort((a, b) => a.t - b.t);
  return { track, arrivals, endT, photos, rejected };
}
