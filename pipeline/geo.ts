/** Utilidades geográficas y del recorrido reconstruido con el GPS del iPhone. */

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Punto del recorrido: instante UTC (ms) y posición. */
export interface Fix extends LatLon {
  t: number;
}

/** Ordena por tiempo y elimina puntos repetidos en el mismo instante. */
export function buildTrack(fixes: readonly Fix[]): Fix[] {
  const sorted = [...fixes].sort((a, b) => a.t - b.t);
  return sorted.filter((fix, i) => i === 0 || fix.t !== sorted[i - 1]?.t);
}

export interface Located extends LatLon {
  /** true si la posición es interpolada o de una foto del iPhone a más de `exactWithinMs`. */
  approx: boolean;
}

export interface LocateOptions {
  /** Una foto del iPhone a menos de esto da una posición exacta (por defecto 2 min). */
  exactWithinMs: number;
  /** Hueco máximo entre dos puntos para interpolar entre ellos (por defecto 3 h). */
  maxInterpolationGapMs: number;
  /** Si no se puede interpolar, se usa el punto más cercano hasta esta distancia en tiempo (por defecto 20 min). */
  nearestWithinMs: number;
}

const DEFAULT_LOCATE: LocateOptions = {
  exactWithinMs: 2 * 60_000,
  maxInterpolationGapMs: 3 * 3_600_000,
  nearestWithinMs: 20 * 60_000,
};

/** Índice del primer punto con t >= `t`. */
function firstAtOrAfter(track: readonly Fix[], t: number): number {
  let lo = 0;
  let hi = track.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((track[mid]?.t ?? Infinity) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Posición estimada en el instante `t` a partir del recorrido del iPhone. */
export function locateAt(
  track: readonly Fix[],
  t: number,
  options: LocateOptions = DEFAULT_LOCATE,
): Located | null {
  const i = firstAtOrAfter(track, t);
  const after = track[i];
  const before = track[i - 1];
  const dAfter = after ? after.t - t : Infinity;
  const dBefore = before ? t - before.t : Infinity;
  const nearest = dAfter <= dBefore ? after : before;
  const dNearest = Math.min(dAfter, dBefore);

  if (nearest && dNearest <= options.exactWithinMs) {
    return { lat: nearest.lat, lon: nearest.lon, approx: false };
  }
  if (before && after && after.t - before.t <= options.maxInterpolationGapMs) {
    const k = (t - before.t) / (after.t - before.t);
    return {
      lat: before.lat + (after.lat - before.lat) * k,
      lon: before.lon + (after.lon - before.lon) * k,
      approx: true,
    };
  }
  if (nearest && dNearest <= options.nearestWithinMs) {
    return { lat: nearest.lat, lon: nearest.lon, approx: true };
  }
  return null;
}
