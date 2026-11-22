/**
 * Medidas de calidad sobre una imagen en escala de grises (funciones puras, sin E/S):
 * nitidez (varianza del laplaciano), exposición y huella perceptual (pHash).
 */

/** Luminancia (Rec. 601) de un búfer RGB o RGBA. */
export function luminance(pixels: Uint8Array, channels: number): Uint8Array {
  const n = Math.floor(pixels.length / channels);
  const gray = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i += 1, p += channels) {
    gray[i] = Math.round(
      0.299 * (pixels[p] ?? 0) + 0.587 * (pixels[p + 1] ?? 0) + 0.114 * (pixels[p + 2] ?? 0),
    );
  }
  return gray;
}

/** Laplaciano de 4 vecinos en (x, y). */
function laplacianAt(gray: Uint8Array, width: number, x: number, y: number): number {
  const i = y * width + x;
  return (
    (gray[i - width] ?? 0) +
    (gray[i + width] ?? 0) +
    (gray[i - 1] ?? 0) +
    (gray[i + 1] ?? 0) -
    4 * (gray[i] ?? 0)
  );
}

/** Varianza del laplaciano de toda la imagen: alta = nítida, baja = movida o desenfocada. */
export function laplacianVariance(gray: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const v = laplacianAt(gray, width, x, y);
      sum += v;
      sumSq += v * v;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/**
 * Enfoque del sujeto: percentil 90 de la varianza del laplaciano por bloques.
 * Un cielo liso o un fondo desenfocado a propósito no hunden la nota si el sujeto está nítido.
 */
export function focusScore(gray: Uint8Array, width: number, height: number, block = 64): number {
  const values: number[] = [];
  for (let by = 1; by + block < height; by += block) {
    for (let bx = 1; bx + block < width; bx += block) {
      let sum = 0;
      let sumSq = 0;
      for (let y = by; y < by + block; y += 1) {
        for (let x = bx; x < bx + block; x += 1) {
          const v = laplacianAt(gray, width, x, y);
          sum += v;
          sumSq += v * v;
        }
      }
      const n = block * block;
      const mean = sum / n;
      values.push(sumSq / n - mean * mean);
    }
  }
  if (values.length === 0) return laplacianVariance(gray, width, height);
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(values.length * 0.9))] ?? 0;
}

export interface Exposure {
  /** Luminancia media (0–255). */
  mean: number;
  /** Fracción de píxeles quemados (≥ 250). */
  clippedHigh: number;
  /** Fracción de píxeles empastados (≤ 5). */
  clippedLow: number;
}

export function exposureStats(gray: Uint8Array): Exposure {
  if (gray.length === 0) return { mean: 0, clippedHigh: 0, clippedLow: 0 };
  let sum = 0;
  let high = 0;
  let low = 0;
  for (const v of gray) {
    sum += v;
    if (v >= 250) high += 1;
    if (v <= 5) low += 1;
  }
  return {
    mean: sum / gray.length,
    clippedHigh: high / gray.length,
    clippedLow: low / gray.length,
  };
}

const PHASH_SIZE = 32;
const PHASH_LOW = 8;
const COS_TABLE: number[][] = Array.from({ length: PHASH_LOW }, (_, u) =>
  Array.from({ length: PHASH_SIZE }, (_, x) =>
    Math.cos(((2 * x + 1) * u * Math.PI) / (2 * PHASH_SIZE)),
  ),
);

/**
 * pHash de 64 bits (como `imagehash.phash`): DCT de la imagen reducida a 32×32,
 * frecuencias bajas 8×8 comparadas con su mediana. Devuelve 16 caracteres hexadecimales.
 */
export function phashFromGray32(gray32: Uint8Array): string {
  if (gray32.length !== PHASH_SIZE * PHASH_SIZE) {
    throw new RangeError(`Se esperaban ${String(PHASH_SIZE * PHASH_SIZE)} píxeles`);
  }
  const coeffs: number[] = [];
  for (let u = 0; u < PHASH_LOW; u += 1) {
    const cu = COS_TABLE[u] ?? [];
    for (let v = 0; v < PHASH_LOW; v += 1) {
      const cv = COS_TABLE[v] ?? [];
      let sum = 0;
      for (let y = 0; y < PHASH_SIZE; y += 1) {
        const cy = cu[y] ?? 0;
        for (let x = 0; x < PHASH_SIZE; x += 1) {
          sum += (gray32[y * PHASH_SIZE + x] ?? 0) * cy * (cv[x] ?? 0);
        }
      }
      coeffs.push(sum);
    }
  }
  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = ((sorted[31] ?? 0) + (sorted[32] ?? 0)) / 2;
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b += 1) nibble = (nibble << 1) | ((coeffs[i + b] ?? 0) > median ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}

/** Número de bits distintos entre dos pHash hexadecimales de la misma longitud. */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) throw new RangeError('Los pHash deben tener la misma longitud');
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i] ?? '0', 16) ^ parseInt(b[i] ?? '0', 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}
