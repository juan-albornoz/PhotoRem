import type { Place } from '../shared/config.ts';
import { haversineKm, type Fix } from './geo.ts';
import { utcToLocal } from './time.ts';

/**
 * Asignación de fotos a lugares. Cada lugar es el tramo que va desde que llegas a él hasta que
 * llegas al siguiente. La llegada se calcula con el recorrido del iPhone y después se reparte
 * cada foto (también las de la Canon, que no tienen GPS) según su hora.
 */

export interface Arrival {
  placeId: string;
  /** Instante UTC (ms) estimado de llegada. */
  t: number;
  /** Primera foto del iPhone dentro del radio (o la más cercana): la llegada no puede ser posterior. */
  firstInsideT: number;
  /** `radius`: hubo una foto dentro del radio del lugar. `closest`: no; se usa la foto más cercana. */
  method: 'radius' | 'closest';
  /** Distancia al centro del lugar de la primera foto dentro del radio (o de la más cercana). */
  distanceKm: number;
  /** Última foto del iPhone antes de llegar, si la hay. */
  previous: { t: number; distanceKm: number } | null;
}

export interface ArrivalOptions {
  /** Velocidad a pie para estimar la llegada entre dos fotos del iPhone. */
  walkingKmh: number;
  /** Factor para pasar de distancia en línea recta a distancia por el camino. */
  routeFactor: number;
  /** Zona horaria para saber si la llegada estimada cae el mismo día y antes de `latestLocalHour`. */
  timeZone: string;
  /** Nadie llega andando más tarde de esta hora local: si la estimación pasa de aquí, no se usa. */
  latestLocalHour: number;
}

export const DEFAULT_ARRIVAL_OPTIONS: ArrivalOptions = {
  walkingKmh: 4.5,
  routeFactor: 1.25,
  timeZone: 'Europe/Madrid',
  latestLocalHour: 21,
};

/**
 * Instante de llegada entre la última foto fuera del radio (`prev`) y la primera dentro (`inside`):
 * se supone que seguiste andando hacia el lugar a velocidad constante. Si con eso llegarías otro día
 * o de noche (hubo transporte o te quedaste a dormir antes), se usa la primera foto dentro del radio.
 */
export function estimateArrival(
  prev: { t: number; distanceKm: number } | null,
  inside: { t: number },
  radiusKm: number,
  options: ArrivalOptions = DEFAULT_ARRIVAL_OPTIONS,
): number {
  if (!prev) return inside.t;
  const remainingKm = Math.max(0, prev.distanceKm - radiusKm) * options.routeFactor;
  const estimate = prev.t + (remainingKm / options.walkingKmh) * 3_600_000;
  if (estimate >= inside.t) return inside.t;
  const prevLocal = utcToLocal(prev.t, options.timeZone);
  const estimateLocal = utcToLocal(estimate, options.timeZone);
  const sameDay = prevLocal.slice(0, 10) === estimateLocal.slice(0, 10);
  const hour = Number(estimateLocal.slice(11, 13));
  if (!sameDay || hour >= options.latestLocalHour) return inside.t;
  return Math.max(prev.t, estimate);
}

export function computeArrivals(
  places: readonly Place[],
  track: readonly Fix[],
  options: ArrivalOptions = DEFAULT_ARRIVAL_OPTIONS,
): Arrival[] {
  const arrivals: Arrival[] = [];
  let from = 0;
  for (const place of places) {
    let found: { index: number; distance: number } | null = null;
    for (let i = from; i < track.length; i += 1) {
      const fix = track[i];
      if (!fix) continue;
      const distance = haversineKm(fix, place);
      if (distance <= place.radiusKm) {
        found = { index: i, distance };
        break;
      }
    }
    let method: Arrival['method'] = 'radius';
    if (!found) {
      method = 'closest';
      for (let i = from; i < track.length; i += 1) {
        const fix = track[i];
        if (!fix) continue;
        const distance = haversineKm(fix, place);
        if (!found || distance < found.distance) found = { index: i, distance };
      }
    }
    const fix = found ? track[found.index] : undefined;
    if (!found || !fix) {
      throw new Error(`No hay puntos del recorrido para calcular la llegada a ${place.name}`);
    }
    const prevFix = found.index > 0 ? track[found.index - 1] : undefined;
    const previous = prevFix ? { t: prevFix.t, distanceKm: haversineKm(prevFix, place) } : null;
    const t = method === 'radius' ? estimateArrival(previous, fix, place.radiusKm, options) : fix.t;
    // La llegada nunca puede ser anterior a la del lugar previo.
    const floor = arrivals.at(-1)?.t ?? -Infinity;
    arrivals.push({
      placeId: place.id,
      t: Math.max(t, floor),
      firstInsideT: fix.t,
      method,
      distanceKm: found.distance,
      previous,
    });
    from = found.index;
  }
  return arrivals;
}

/**
 * Lugar de una foto tomada en el instante `t`: el último lugar al que ya habías llegado.
 * Devuelve null antes de llegar al primer lugar o después de `endT` (vuelta a casa).
 */
export function assignPlace(arrivals: readonly Arrival[], t: number, endT: number): string | null {
  if (t > endT) return null;
  let current: string | null = null;
  for (const arrival of arrivals) {
    if (arrival.t <= t) current = arrival.placeId;
    else break;
  }
  return current;
}

/** Fin del viaje: el último punto del recorrido a menos de `withinKm` del último lugar, más un margen. */
export function tripEnd(
  lastPlace: Place,
  track: readonly Fix[],
  withinKm = 40,
  marginMs = 6 * 3_600_000,
): number {
  let last = -Infinity;
  for (const fix of track) {
    if (haversineKm(fix, lastPlace) <= withinKm) last = fix.t;
  }
  return last + marginMs;
}
