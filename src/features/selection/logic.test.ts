import { describe, expect, it } from 'vitest';

import { selectionDataFixture } from '../../test/fixtures.ts';
import {
  completedPlaces,
  countSelected,
  dayRange,
  describePhoto,
  formatLocalTime,
  thumbSize,
  togglePhoto,
} from './logic.ts';

const order = new Map([
  ['a', 0],
  ['b', 1],
  ['c', 2],
  ['d', 3],
]);

describe('togglePhoto', () => {
  it('añade en orden cronológico y quita', () => {
    const added = togglePhoto({ burgos: ['c'] }, 'burgos', 'a', 3, order);
    expect(added).toEqual({ places: { burgos: ['a', 'c'] }, status: 'added' });
    const removed = togglePhoto(added.places, 'burgos', 'c', 3, order);
    expect(removed).toEqual({ places: { burgos: ['a'] }, status: 'removed' });
  });

  it('no pasa del máximo por lugar', () => {
    const places = { burgos: ['a', 'b'] };
    const result = togglePhoto(places, 'burgos', 'c', 2, order);
    expect(result.status).toBe('limit');
    expect(result.places).toBe(places);
  });

  it('crea la lista de un lugar que aún no tenía fotos', () => {
    expect(togglePhoto({}, 'leon', 'd', 10, order).places).toEqual({ leon: ['d'] });
  });

  it('no modifica el objeto original', () => {
    const places = { burgos: ['a'] };
    togglePhoto(places, 'burgos', 'b', 3, order);
    expect(places).toEqual({ burgos: ['a'] });
  });
});

describe('avance', () => {
  it('cuenta fotos por lugar y lugares completos', () => {
    const places = { burgos: ['a', 'b'], leon: ['c'] };
    expect(countSelected(places, 'burgos')).toBe(2);
    expect(countSelected(places, 'muxia')).toBe(0);
    expect(completedPlaces(places, ['burgos', 'leon', 'muxia'], 2)).toBe(1);
  });
});

describe('formato', () => {
  it('fecha y hora en español sin depender de la zona del navegador', () => {
    expect(formatLocalTime('2026-10-06T10:46:12')).toEqual({ day: '6 oct', time: '10:46' });
    expect(formatLocalTime('2026-11-03T07:54:03')).toEqual({ day: '3 nov', time: '07:54' });
  });

  it('rango de días', () => {
    expect(dayRange([])).toBe('');
    expect(dayRange([{ localTime: '2026-10-06T10:00:00' }])).toBe('6 oct');
    expect(
      dayRange([{ localTime: '2026-10-07T10:00:00' }, { localTime: '2026-10-05T20:00:00' }]),
    ).toBe('5–7 oct');
    expect(
      dayRange([{ localTime: '2026-10-31T09:00:00' }, { localTime: '2026-11-02T19:00:00' }]),
    ).toBe('31 oct – 2 nov');
  });

  it('describe cada foto para lectores de pantalla', () => {
    const photo = selectionDataFixture().photos[1];
    if (!photo) throw new Error('falta la foto de prueba');
    expect(describePhoto(photo, 'Burgos', 2)).toBe('Foto 2 de Burgos, 6 oct a las 10:46, Canon');
  });

  it('reserva el tamaño de la miniatura según la orientación', () => {
    expect(thumbSize({ width: 6000, height: 4000 })).toEqual({ width: 480, height: 320 });
    expect(thumbSize({ width: 3024, height: 4032 })).toEqual({ width: 360, height: 480 });
  });
});
