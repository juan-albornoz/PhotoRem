import { describe, expect, it } from 'vitest';

import { effectiveDpi, meetsPrintDpi, mmToPx, pxToMm } from './units.ts';

describe('unidades de impresión', () => {
  it('convierte 300 mm a 300 ppp en unos 3543 px', () => {
    expect(mmToPx(300, 300)).toBeCloseTo(3543.3, 1);
  });

  it('mmToPx y pxToMm son inversas', () => {
    expect(pxToMm(mmToPx(123.4, 300), 300)).toBeCloseTo(123.4, 10);
  });

  it('una foto de la Canon (4000 px de alto) supera 300 ppp a sangre en 30×30 con sangrado', () => {
    expect(effectiveDpi(4000, 306)).toBeCloseTo(332, 0);
    expect(meetsPrintDpi(4000, 306)).toBe(true);
  });

  it('una foto de 12 MP del iPhone (3024 px) no llega a 300 ppp a página completa', () => {
    expect(effectiveDpi(3024, 300)).toBeCloseTo(256, 0);
    expect(meetsPrintDpi(3024, 300)).toBe(false);
  });

  it('la misma foto sí llega en un hueco de media página', () => {
    expect(meetsPrintDpi(3024, 150)).toBe(true);
  });

  it('rechaza tamaños impresos no válidos', () => {
    expect(() => effectiveDpi(1000, 0)).toThrow(RangeError);
    expect(() => effectiveDpi(1000, Number.NaN)).toThrow(RangeError);
    expect(() => effectiveDpi(-1, 100)).toThrow(RangeError);
  });
});
