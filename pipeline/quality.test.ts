import { describe, expect, it } from 'vitest';

import { clusterNearDuplicates } from './dedupe.ts';
import {
  exposureStats,
  focusScore,
  hammingHex,
  laplacianVariance,
  luminance,
  phashFromGray32,
} from './quality.ts';

/** Imagen de prueba: tablero de ajedrez (nítido) o degradado suave (sin detalle). */
function checkerboard(size: number, cell: number): Uint8Array {
  const img = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      img[y * size + x] = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 230 : 25;
  return img;
}
function gradient(size: number): Uint8Array {
  const img = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) img[y * size + x] = Math.round((x / (size - 1)) * 255);
  return img;
}

describe('nitidez', () => {
  it('un tablero nítido puntúa mucho más que un degradado liso', () => {
    const sharp = checkerboard(256, 4);
    const smooth = gradient(256);
    expect(laplacianVariance(sharp, 256, 256)).toBeGreaterThan(1000);
    expect(laplacianVariance(smooth, 256, 256)).toBeLessThan(1);
    expect(focusScore(sharp, 256, 256)).toBeGreaterThan(focusScore(smooth, 256, 256));
  });
});

describe('exposición y luminancia', () => {
  it('calcula media y recortes', () => {
    const stats = exposureStats(new Uint8Array([0, 0, 255, 255]));
    expect(stats).toEqual({ mean: 127.5, clippedHigh: 0.5, clippedLow: 0.5 });
  });

  it('pasa RGB a gris', () => {
    expect([...luminance(new Uint8Array([255, 255, 255, 0, 0, 0]), 3)]).toEqual([255, 0]);
  });
});

/** Imagen 32×32 con formas suaves (frecuencias bajas), como una foto reducida. */
function blobs(phaseX: number, phaseY: number): Uint8Array {
  const img = new Uint8Array(32 * 32);
  for (let y = 0; y < 32; y += 1)
    for (let x = 0; x < 32; x += 1)
      img[y * 32 + x] = Math.round(128 + 90 * Math.sin(x / 5 + phaseX) * Math.cos(y / 7 + phaseY));
  return img;
}

describe('pHash', () => {
  it('es estable, distingue imágenes distintas y tolera un pequeño cambio', () => {
    const base = blobs(0, 0);
    // Ruido leve, como el de dos fotos de una ráfaga.
    const tweaked = Uint8Array.from(base, (v, i) => Math.min(255, v + ((i * 7919) % 5)));
    const other = blobs(2.5, 1.8);
    const h = phashFromGray32(base);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(phashFromGray32(base)).toBe(h);
    expect(hammingHex(h, phashFromGray32(tweaked))).toBeLessThanOrEqual(4);
    expect(hammingHex(h, phashFromGray32(other))).toBeGreaterThan(10);
  });

  it('hamming cuenta los bits distintos', () => {
    expect(hammingHex('0000000000000000', '000000000000000f')).toBe(4);
    expect(() => hammingHex('00', '000')).toThrow(RangeError);
  });

  it('rechaza tamaños que no son 32×32', () => {
    expect(() => phashFromGray32(new Uint8Array(10))).toThrow(RangeError);
  });
});

describe('ráfagas', () => {
  it('agrupa fotos parecidas y cercanas en el tiempo, pero no las lejanas', () => {
    const groups = clusterNearDuplicates([
      { id: 'a', t: 0, phash: '0000000000000000' },
      { id: 'b', t: 60_000, phash: '0000000000000003' }, // 2 bits, 1 min después
      { id: 'c', t: 90_000, phash: 'ffffffffffffffff' }, // otra escena
      { id: 'd', t: 3_600_000, phash: '0000000000000001' }, // parecida pero una hora después
    ]);
    expect(groups.get('b')).toBe(groups.get('a'));
    expect(groups.get('c')).not.toBe(groups.get('a'));
    expect(groups.get('d')).not.toBe(groups.get('a'));
  });
});
