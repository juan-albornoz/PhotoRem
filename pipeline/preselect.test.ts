import { describe, expect, it } from 'vitest';

import { coOccurrenceScores, estimateCanonOffset } from './calibrate.ts';
import {
  canonTarget,
  ensureQuota,
  exposurePenalty,
  pickSpread,
  preselectPlace,
  type ScorablePhoto,
} from './preselect.ts';

const MIN = 60_000;

function photo(i: number, over: Partial<ScorablePhoto> = {}): ScorablePhoto {
  return {
    id: `p${String(i)}`,
    t: i * 10 * MIN,
    source: 'iphone',
    orientation: 'landscape',
    focus: 100 + i,
    exposureMean: 120,
    clippedHigh: 0,
    clippedLow: 0,
    megapixels: 24,
    edited: false,
    clusterId: `p${String(i)}`,
    blurry: false,
    inPlace: false,
    ...over,
  };
}

describe('preselección', () => {
  it('penaliza fotos muy oscuras o quemadas', () => {
    expect(exposurePenalty({ exposureMean: 120, clippedHigh: 0, clippedLow: 0 })).toBe(0);
    expect(exposurePenalty({ exposureMean: 10, clippedHigh: 0, clippedLow: 0.5 })).toBeGreaterThan(
      0.5,
    );
    expect(exposurePenalty({ exposureMean: 250, clippedHigh: 0.4, clippedLow: 0 })).toBe(1);
  });

  it('reparte la elección a lo largo del tramo', () => {
    const items = Array.from({ length: 40 }, (_, i) => photo(i));
    const score = new Map(items.map((p) => [p.id, 1]));
    const picks = pickSpread(items, 4, score);
    expect(picks).toHaveLength(4);
    // Una de cada cuarto del tramo.
    expect(picks.map((p) => Math.floor(Number(p.id.slice(1)) / 10))).toEqual([0, 1, 2, 3]);
  });

  it('con separación mínima no elige dos fotos casi simultáneas si hay alternativa', () => {
    // p0 y p1 a 1 min; p2 a 20 min. Dos tramos: [p0] y [p1, p2]; p1 es la mejor del segundo pero está pegada a p0.
    const items = [photo(0, { t: 0 }), photo(1, { t: MIN }), photo(2, { t: 20 * MIN })];
    const score = new Map([
      ['p0', 0.9],
      ['p1', 0.8],
      ['p2', 0.3],
    ]);
    expect(pickSpread(items, 2, score).map((p) => p.id)).toEqual(['p0', 'p1']);
    expect(pickSpread(items, 2, score, 3 * MIN).map((p) => p.id)).toEqual(['p0', 'p2']);
  });
  it('reparte entre la Canon y el iPhone según su peso en el lugar', () => {
    expect(canonTarget(10, 149, 54, 0.73)).toBe(7);
    expect(canonTarget(10, 79, 121, 0.4)).toBe(4);
    // Siempre al menos 2 de cada cámara si las hay.
    expect(canonTarget(10, 6, 106, 0.05)).toBe(2);
    expect(canonTarget(10, 100, 3, 0.97)).toBe(8);
    // Sin fotos de la Canon (desde O Cebreiro), ninguna.
    expect(canonTarget(10, 0, 47, 0)).toBe(0);
  });

  it('la Canon no queda fuera aunque el iPhone puntúe más', () => {
    const iphone = Array.from({ length: 20 }, (_, i) =>
      photo(i, { focus: 5000 + i, edited: true, inPlace: true }),
    );
    const canon = Array.from({ length: 30 }, (_, i) =>
      photo(100 + i, { source: 'canon', focus: 100 + i, t: (i * 10 + 5) * MIN }),
    );
    const result = preselectPlace([...iphone, ...canon], { candidates: 20, suggested: 10 });
    const canonIds = (ids: string[]): number =>
      ids.filter((id) => Number(id.slice(1)) >= 100).length;
    // La Canon pesa un 60 % en el lugar: 12 de 20 candidatas y 6 de 10 sugeridas.
    expect(canonIds(result.candidates)).toBe(12);
    expect(canonIds(result.suggested)).toBe(6);
  });
  it('cumple una cuota cambiando los peor puntuados que no la cumplen', () => {
    const chosen = [photo(1), photo(2), photo(3)];
    const pool = [...chosen, photo(9, { orientation: 'portrait' })];
    const score = new Map([
      ['p1', 0.9],
      ['p2', 0.1],
      ['p3', 0.5],
      ['p9', 0.4],
    ]);
    const result = ensureQuota(chosen, pool, (p) => p.orientation === 'portrait', 1, score);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p9', 'p3']);
  });

  it('no quita elementos protegidos al cumplir otra cuota', () => {
    const chosen = [photo(1, { inPlace: true }), photo(2)];
    const pool = [...chosen, photo(9, { orientation: 'portrait' })];
    const score = new Map([
      ['p1', 0.1],
      ['p2', 0.5],
      ['p9', 0.4],
    ]);
    const result = ensureQuota(
      chosen,
      pool,
      (p) => p.orientation === 'portrait',
      1,
      score,
      (p) => p.inPlace,
    );
    expect(result.map((p) => p.id)).toEqual(['p1', 'p9']);
  });

  it('incluye fotos del propio lugar aunque haya otras más nítidas en el camino', () => {
    const road = Array.from({ length: 40 }, (_, i) => photo(i, { focus: 1000 + i }));
    const town = Array.from({ length: 8 }, (_, i) =>
      photo(200 + i, { focus: 10, inPlace: true, t: i * MIN }),
    );
    const result = preselectPlace([...road, ...town], { candidates: 20, suggested: 10 });
    expect(
      result.candidates.filter((id) => Number(id.slice(1)) >= 200).length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      result.suggested.filter((id) => Number(id.slice(1)) >= 200).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('descarta movidas y deja una foto por ráfaga', () => {
    const photos = [
      ...Array.from({ length: 30 }, (_, i) => photo(i)),
      photo(100, { blurry: true, focus: 1 }),
      photo(101, { clusterId: 'p5', focus: 500 }), // mejor foto de la ráfaga de p5
    ];
    const result = preselectPlace(photos, { candidates: 20, suggested: 10 });
    expect(result.candidates).toHaveLength(20);
    expect(result.suggested).toHaveLength(10);
    expect(result.candidates).not.toContain('p100');
    expect(result.candidates).not.toContain('p5');
    expect(result.suggested.every((id) => result.candidates.includes(id))).toBe(true);
  });

  it('con pocas fotos devuelve todas las que hay', () => {
    const result = preselectPlace([photo(1), photo(2), photo(3)], {
      candidates: 20,
      suggested: 10,
    });
    expect(result.candidates).toEqual(['p1', 'p2', 'p3']);
    expect(result.suggested).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('calibración del reloj de la Canon', () => {
  it('encuentra el desfase con el que coinciden los dos aparatos', () => {
    const phone = Array.from({ length: 50 }, (_, i) => i * 37 * MIN);
    const canon = phone.filter((_, i) => i % 2 === 0).map((t) => t - 3 * MIN); // la Canon va 3 min atrasada
    const result = estimateCanonOffset(canon, phone, {
      fromMinutes: -60,
      toMinutes: 60,
      windowMinutes: 0.5,
    });
    expect(result.best.offsetMinutes).toBe(3);
    expect(
      coOccurrenceScores(canon, phone, { fromMinutes: 3, toMinutes: 3, windowMinutes: 0.5 })[0]
        ?.matches,
    ).toBe(25);
  });
});
