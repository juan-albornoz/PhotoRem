import type { Orientation } from '../shared/manifest.ts';

/**
 * Preselección por lugar: descarta movidas y ráfagas, puntúa por nitidez, exposición y resolución,
 * y reparte las elegidas a lo largo del tramo para que haya variedad (no diez fotos del mismo rato).
 */

export type Source = 'canon' | 'iphone';

export interface ScorablePhoto {
  id: string;
  t: number;
  source: Source;
  orientation: Orientation;
  focus: number;
  exposureMean: number;
  clippedHigh: number;
  clippedLow: number;
  megapixels: number;
  edited: boolean;
  clusterId: string;
  blurry: boolean;
  /** Tomada dentro del pueblo o monumento (según el GPS), no en el camino hacia el siguiente. */
  inPlace: boolean;
}

/** Penalización de exposición entre 0 (bien expuesta) y 1 (muy oscura, quemada o empastada). */
export function exposurePenalty(
  p: Pick<ScorablePhoto, 'exposureMean' | 'clippedHigh' | 'clippedLow'>,
): number {
  let penalty = 0;
  if (p.exposureMean < 35) penalty += (35 - p.exposureMean) / 35;
  if (p.exposureMean > 225) penalty += (p.exposureMean - 225) / 30;
  penalty += Math.max(0, p.clippedHigh - 0.08) * 3;
  penalty += Math.max(0, p.clippedLow - 0.15) * 2;
  return Math.min(1, Math.max(0, penalty));
}

/**
 * Puntuación 0–1 dentro de un lugar. La nitidez cuenta como percentil dentro del propio lugar y con
 * peso moderado: mide textura, y un amanecer o un cielo limpio tienen poca aunque sean buenas fotos.
 */
export function scorePhotos(photos: readonly ScorablePhoto[]): Map<string, number> {
  const byFocus = [...photos].sort((a, b) => a.focus - b.focus);
  const rank = new Map(
    byFocus.map((p, i) => [p.id, byFocus.length > 1 ? i / (byFocus.length - 1) : 1]),
  );
  return new Map(
    photos.map((p) => [
      p.id,
      0.35 * (rank.get(p.id) ?? 0) +
        0.3 * (1 - exposurePenalty(p)) +
        0.15 * Math.min(1, p.megapixels / 20) +
        // Bonificación pequeña: solo el iPhone tiene «editadas» y no debe dejar fuera a la Canon.
        0.05 * (p.edited ? 1 : 0) +
        0.15 * (p.inPlace ? 1 : 0),
    ]),
  );
}

/** true si `item` está a menos de `minGapMs` de alguno de `others` (y no es él mismo). */
function tooClose<T extends { id: string; t: number }>(
  item: T,
  others: readonly T[],
  minGapMs: number,
): boolean {
  return minGapMs > 0 && others.some((o) => o.id !== item.id && Math.abs(o.t - item.t) < minGapMs);
}

/**
 * Elige `count` elementos repartidos en el tiempo: el mejor de cada tramo con el mismo número de fotos.
 * Con `minGapMs`, evita dos elegidas casi en el mismo momento si el tramo tiene alternativa.
 */
export function pickSpread<T extends { id: string; t: number }>(
  items: readonly T[],
  count: number,
  score: ReadonlyMap<string, number>,
  minGapMs = 0,
): T[] {
  const sorted = [...items].sort((a, b) => a.t - b.t);
  if (sorted.length <= count) return sorted;
  const picks: T[] = [];
  const better = (a: T | undefined, b: T): T =>
    !a || (score.get(b.id) ?? 0) > (score.get(a.id) ?? 0) ? b : a;
  for (let b = 0; b < count; b += 1) {
    const bucket = sorted.slice(
      Math.floor((b * sorted.length) / count),
      Math.floor(((b + 1) * sorted.length) / count),
    );
    const spaced = bucket.filter((p) => !tooClose(p, picks, minGapMs));
    const best = (spaced.length > 0 ? spaced : bucket).reduce<T | undefined>(better, undefined);
    if (best) picks.push(best);
  }
  return picks;
}

/**
 * Asegura al menos `min` elementos que cumplan `wanted` en `chosen`, cambiando los peor puntuados
 * que no lo cumplen (y no están protegidos) por los mejores de `pool` que sí lo cumplen.
 */
export function ensureQuota<T extends { id: string; t: number }>(
  chosen: readonly T[],
  pool: readonly T[],
  wanted: (item: T) => boolean,
  min: number,
  score: ReadonlyMap<string, number>,
  /** Recibe también la selección actual, para proteger solo mientras otra cuota lo necesite. */
  isProtected: (item: T, current: readonly T[]) => boolean = () => false,
  minGapMs = 0,
): T[] {
  const result = [...chosen];
  const ids = new Set(result.map((p) => p.id));
  const spare = pool
    .filter((p) => wanted(p) && !ids.has(p.id))
    .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0));
  let count = result.filter(wanted).length;
  while (count < min && spare.length > 0) {
    const worst = result
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => !wanted(p) && !isProtected(p, result))
      .sort((a, b) => (score.get(a.p.id) ?? 0) - (score.get(b.p.id) ?? 0))[0];
    if (!worst) break;
    const others = result.filter((_, i) => i !== worst.index);
    // Preferimos una sustituta que no sea casi simultánea a otra ya elegida.
    const at = spare.findIndex((p) => !tooClose(p, others, minGapMs));
    const [replacement] = spare.splice(at >= 0 ? at : 0, 1);
    if (!replacement) break;
    result[worst.index] = replacement;
    count += 1;
  }
  return result;
}

const isPortrait = (p: { orientation: Orientation }): boolean => p.orientation === 'portrait';
const isInPlace = (p: { inPlace: boolean }): boolean => p.inPlace;
const isCanon = (p: { source: Source }): boolean => p.source === 'canon';
const isIphone = (p: { source: Source }): boolean => p.source === 'iphone';

/**
 * Cuántas fotos de la Canon debería haber entre 
, según su peso en el lugar (canonShare).
 * Siempre al menos 2 de cada cámara si las hay, para que ninguna desaparezca.
 */
export function canonTarget(
  n: number,
  canonAvailable: number,
  iphoneAvailable: number,
  canonShare: number,
): number {
  const minCanon = Math.min(2, canonAvailable, n);
  const minIphone = Math.min(2, iphoneAvailable, n - minCanon);
  return Math.max(minCanon, Math.min(n - minIphone, Math.round(n * canonShare), canonAvailable));
}

/**
 * Cuotas, por orden: fotos del propio lugar; verticales (sin quitar fotos del lugar); y equilibrio
 * entre la Canon y el iPhone (sin quitar fotos del lugar ni bajar de la cuota de verticales).
 */
function applyQuotas(
  chosen: readonly ScorablePhoto[],
  pool: readonly ScorablePhoto[],
  quotas: { inPlace: number; portraits: number },
  score: ReadonlyMap<string, number>,
  canonShare: number,
  minGapMs = 0,
): ScorablePhoto[] {
  const inPlaceQuota = Math.min(quotas.inPlace, pool.filter(isInPlace).length);
  const portraitQuota = Math.min(quotas.portraits, pool.filter(isPortrait).length);
  // Se protege una foto solo si quitarla dejaría su cuota por debajo del mínimo.
  const neededInPlace = (p: ScorablePhoto, current: readonly ScorablePhoto[]): boolean =>
    p.inPlace && current.filter(isInPlace).length <= inPlaceQuota;
  const neededPortrait = (p: ScorablePhoto, current: readonly ScorablePhoto[]): boolean =>
    isPortrait(p) && current.filter(isPortrait).length <= portraitQuota;

  const withPlace = ensureQuota(
    chosen,
    pool,
    isInPlace,
    inPlaceQuota,
    score,
    () => false,
    minGapMs,
  );
  const withPortraits = ensureQuota(
    withPlace,
    pool,
    isPortrait,
    portraitQuota,
    score,
    neededInPlace,
    minGapMs,
  );

  const n = withPortraits.length;
  const target = canonTarget(
    n,
    pool.filter(isCanon).length,
    pool.filter(isIphone).length,
    canonShare,
  );
  const canonNow = withPortraits.filter(isCanon).length;
  const keep = (p: ScorablePhoto, current: readonly ScorablePhoto[]): boolean =>
    neededInPlace(p, current) || neededPortrait(p, current);
  if (canonNow < target) {
    return ensureQuota(withPortraits, pool, isCanon, target, score, keep, minGapMs);
  }
  if (n - canonNow < n - target) {
    return ensureQuota(withPortraits, pool, isIphone, n - target, score, keep, minGapMs);
  }
  return withPortraits;
}

/** En la sugerencia, dos fotos con menos de esto de diferencia suelen ser la misma escena. */
const SUGGESTED_MIN_GAP_MS = 3 * 60_000;

export interface PreselectResult {
  candidates: string[];
  suggested: string[];
}

export function preselectPlace(
  photos: readonly ScorablePhoto[],
  options: { candidates: number; suggested: number },
): PreselectResult {
  const score = scorePhotos(photos);
  const byScore = (a: ScorablePhoto, b: ScorablePhoto): number =>
    (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0);

  // 1. Fuera las movidas, salvo que no queden suficientes.
  let eligible = photos.filter((p) => !p.blurry);
  if (eligible.length < options.suggested) {
    eligible = [...eligible, ...photos.filter((p) => p.blurry).sort(byScore)].slice(
      0,
      Math.max(options.suggested, eligible.length),
    );
  }

  // 2. Una por ráfaga: la mejor de cada grupo.
  const bestOfCluster = new Map<string, ScorablePhoto>();
  for (const p of [...eligible].sort(byScore)) {
    if (!bestOfCluster.has(p.clusterId)) bestOfCluster.set(p.clusterId, p);
  }
  let pool = [...bestOfCluster.values()];
  if (pool.length < options.suggested) {
    const extra = eligible.filter((p) => !pool.includes(p)).sort(byScore);
    pool = [...pool, ...extra.slice(0, options.suggested - pool.length)];
  }

  // Peso de cada cámara en el lugar: la preselección lo respeta (usa toda la base de fotos).
  const canonShare = photos.length > 0 ? photos.filter(isCanon).length / photos.length : 0;

  // 3. Candidatas repartidas en el tramo, con fotos del propio lugar, verticales y de las dos cámaras.
  const candidates = applyQuotas(
    pickSpread(pool, options.candidates, score),
    pool,
    { inPlace: 6, portraits: 4 },
    score,
    canonShare,
  );

  // 4. Sugerencia de las 10 dentro de las candidatas, con las mismas cuotas a escala.
  const suggested = applyQuotas(
    pickSpread(candidates, options.suggested, score, SUGGESTED_MIN_GAP_MS),
    candidates,
    { inPlace: 4, portraits: 2 },
    score,
    canonShare,
    SUGGESTED_MIN_GAP_MS,
  );

  const chrono = (list: readonly ScorablePhoto[]): string[] =>
    [...list].sort((a, b) => a.t - b.t).map((p) => p.id);
  return { candidates: chrono(candidates), suggested: chrono(suggested) };
}
