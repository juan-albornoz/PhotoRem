/**
 * Calibración del reloj de la Canon contra el iPhone. Cuando ves algo interesante sueles
 * disparar con los dos aparatos, así que con el desfase correcto muchas fotos de la Canon
 * tienen una del iPhone muy cerca en el tiempo. Se prueba cada desfase y se busca el pico.
 */

/** Índice del primer elemento de `sorted` que es >= `value`. */
function lowerBound(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] ?? Infinity) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Distancia (ms) de `value` al elemento más cercano de `sorted`. */
export function nearestDistance(sorted: readonly number[], value: number): number {
  const i = lowerBound(sorted, value);
  const after = sorted[i];
  const before = sorted[i - 1];
  return Math.min(
    after === undefined ? Infinity : after - value,
    before === undefined ? Infinity : value - before,
  );
}

export interface OffsetScore {
  offsetMinutes: number;
  /** Fotos de la Canon con una del iPhone a menos de la ventana. */
  matches: number;
}

export function coOccurrenceScores(
  canonMs: readonly number[],
  phoneMs: readonly number[],
  options: { fromMinutes: number; toMinutes: number; windowMinutes: number },
): OffsetScore[] {
  const phone = [...phoneMs].sort((a, b) => a - b);
  const windowMs = options.windowMinutes * 60_000;
  const scores: OffsetScore[] = [];
  for (let offset = options.fromMinutes; offset <= options.toMinutes; offset += 1) {
    const shift = offset * 60_000;
    let matches = 0;
    for (const t of canonMs) {
      if (nearestDistance(phone, t + shift) <= windowMs) matches += 1;
    }
    scores.push({ offsetMinutes: offset, matches });
  }
  return scores;
}

export interface CalibrationResult {
  best: OffsetScore;
  /** Mejor puntuación fuera de ±30 min del pico: mide si el pico destaca. */
  runnerUp: OffsetScore;
  top: OffsetScore[];
}

export function estimateCanonOffset(
  canonMs: readonly number[],
  phoneMs: readonly number[],
  options = { fromMinutes: -12 * 60, toMinutes: 12 * 60, windowMinutes: 2 },
): CalibrationResult {
  const scores = coOccurrenceScores(canonMs, phoneMs, options);
  const sorted = [...scores].sort((a, b) => b.matches - a.matches);
  const best = sorted[0];
  if (!best) throw new Error('No hay desfases que evaluar');
  const runnerUp = sorted.find((s) => Math.abs(s.offsetMinutes - best.offsetMinutes) > 30) ?? best;
  return { best, runnerUp, top: sorted.slice(0, 10) };
}
