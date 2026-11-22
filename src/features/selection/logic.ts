import type { SelectionPhoto } from '../../../shared/api.ts';

/** Lógica pura de la selección de fotos (sin React), para poder probarla aparte. */

export type SelectionMap = Readonly<Record<string, readonly string[]>>;

export type ToggleStatus = 'added' | 'removed' | 'limit';

export interface ToggleResult {
  places: SelectionMap;
  status: ToggleStatus;
}

/**
 * Añade o quita una foto de un lugar. Si el lugar ya tiene `max`, no añade y devuelve `limit`.
 * Mantiene el orden cronológico usando `order` (posición de cada foto en el tiempo).
 */
export function togglePhoto(
  places: SelectionMap,
  placeId: string,
  photoId: string,
  max: number,
  order: ReadonlyMap<string, number>,
): ToggleResult {
  const current = places[placeId] ?? [];
  if (current.includes(photoId)) {
    return {
      places: { ...places, [placeId]: current.filter((id) => id !== photoId) },
      status: 'removed',
    };
  }
  if (current.length >= max) return { places, status: 'limit' };
  const next = [...current, photoId].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { places: { ...places, [placeId]: next }, status: 'added' };
}

export function countSelected(places: SelectionMap, placeId: string): number {
  return places[placeId]?.length ?? 0;
}

export function completedPlaces(
  places: SelectionMap,
  placeIds: readonly string[],
  max: number,
): number {
  return placeIds.filter((id) => countSelected(places, id) === max).length;
}

const dayFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** `2026-10-06T10:46:12` (hora local de España) → `{ day: '6 oct', time: '10:46' }`. */
export function formatLocalTime(local: string): { day: string; time: string } {
  const [datePart = '', timePart = ''] = local.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return { day: dayFormat.format(date).replace('.', ''), time: timePart.slice(0, 5) };
}

/** Rango de días de una lista de fotos, p. ej. `6–7 oct` o `31 oct – 2 nov`. */
export function dayRange(photos: readonly Pick<SelectionPhoto, 'localTime'>[]): string {
  if (photos.length === 0) return '';
  const sorted = [...photos].map((p) => p.localTime).sort();
  const first = formatLocalTime(sorted[0] ?? '').day;
  const last = formatLocalTime(sorted.at(-1) ?? '').day;
  if (first === last) return first;
  const [d1, m1] = first.split(' ');
  const [d2, m2] = last.split(' ');
  return m1 === m2 ? `${d1 ?? ''}–${d2 ?? ''} ${m1 ?? ''}` : `${first} – ${last}`;
}

/** Descripción accesible de una foto. */
export function describePhoto(photo: SelectionPhoto, placeName: string, position: number): string {
  const { day, time } = formatLocalTime(photo.localTime);
  const device = photo.source === 'canon' ? 'Canon' : 'iPhone';
  return `Foto ${String(position)} de ${placeName}, ${day} a las ${time}, ${device}`;
}

/** Tamaño de la miniatura (lado mayor 480 px) para reservar su hueco y evitar saltos al cargar. */
export function thumbSize(photo: Pick<SelectionPhoto, 'width' | 'height'>): {
  width: number;
  height: number;
} {
  const scale = 480 / Math.max(photo.width, photo.height);
  return { width: Math.round(photo.width * scale), height: Math.round(photo.height * scale) };
}
