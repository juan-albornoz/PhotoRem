import { describe, expect, it } from 'vitest';

import { applyCuration } from './build.ts';

describe('ajustes manuales de la sugerencia', () => {
  const times = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
  ]);
  const entry = { candidates: ['a', 'b', 'c'], suggested: ['a', 'b'] };
  const ranking = ['c', 'a', 'b', 'd'];

  it('cambia una foto por otra manteniendo el orden cronológico', () => {
    const result = applyCuration(entry, times, { add: ['c'], remove: ['a'] }, 2, ranking);
    expect(result.suggested).toEqual(['b', 'c']);
    expect(result.ignored).toEqual([]);
  });

  it('añade a las candidatas una foto del lugar que no estaba preseleccionada', () => {
    const result = applyCuration(entry, times, { add: ['d'], remove: ['b'] }, 2, ranking);
    expect(result.candidates).toEqual(['a', 'b', 'c', 'd']);
    expect(result.suggested).toEqual(['a', 'd']);
  });

  it('si un ajuste viejo deja un hueco, lo rellena con la mejor candidata', () => {
    // Quitar «a» sin añadir nada: entra «c», la mejor clasificada que queda.
    const result = applyCuration(entry, times, { add: [], remove: ['a'] }, 2, ranking);
    expect(result.suggested).toEqual(['b', 'c']);
  });

  it('si sobran, sale la peor clasificada que no se añadió a mano', () => {
    const result = applyCuration(entry, times, { add: ['d'], remove: [] }, 2, ranking);
    expect(result.suggested).toEqual(['a', 'd']);
  });

  it('ignora (y avisa de) ids que no son de este lugar', () => {
    const result = applyCuration(entry, times, { add: ['zzz'], remove: [] }, 2, ranking);
    expect(result.suggested).toEqual(['a', 'b']);
    expect(result.ignored).toEqual(['zzz']);
  });

  it('sin ajustes no cambia nada', () => {
    expect(applyCuration(entry, times, undefined, 2, ranking)).toEqual({ ...entry, ignored: [] });
  });
});
