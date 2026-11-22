import { describe, expect, it } from 'vitest';

import { captureUtc, localToUtc, utcToLocal, zoneOffsetMinutes } from './time.ts';

const MADRID = 'Europe/Madrid';

describe('zonas horarias', () => {
  it('Madrid está en UTC+2 en octubre y en UTC+1 en noviembre (cambio de hora el 25-oct-2026)', () => {
    expect(zoneOffsetMinutes(Date.UTC(2026, 9, 7, 10), MADRID)).toBe(120);
    expect(zoneOffsetMinutes(Date.UTC(2026, 10, 3, 10), MADRID)).toBe(60);
  });

  it('convierte hora local a UTC y de vuelta', () => {
    const utc = localToUtc('2026-10-07T09:20:41', MADRID);
    expect(new Date(utc).toISOString()).toBe('2026-10-07T07:20:41.000Z');
    expect(utcToLocal(utc, MADRID)).toBe('2026-10-07T09:20:41');
  });

  it('respeta el cambio de hora', () => {
    expect(new Date(localToUtc('2026-11-03T07:54:03', MADRID)).toISOString()).toBe(
      '2026-11-03T06:54:03.000Z',
    );
  });
});

describe('captureUtc', () => {
  it('iPhone: usa el desfase que guarda el teléfono', () => {
    const utc = captureUtc(
      { local: '2026-11-03T07:54:03.674', offsetMinutes: 60 },
      'iphone',
      MADRID,
      48,
    );
    expect(new Date(utc ?? 0).toISOString()).toBe('2026-11-03T06:54:03.674Z');
  });

  it('iPhone sin desfase (versión editada): aplica las reglas de Madrid', () => {
    const utc = captureUtc(
      { local: '2026-10-06T11:20:39', offsetMinutes: null },
      'iphone',
      MADRID,
      48,
    );
    expect(new Date(utc ?? 0).toISOString()).toBe('2026-10-06T09:20:39.000Z');
  });

  it('Canon: lee su hora como Madrid y suma la corrección del reloj (48 s)', () => {
    // La Canon dice 09:20:41 con zona «Santiago de Chile», pero su reloj marca la hora española con 48 s de retraso.
    const utc = captureUtc(
      { local: '2026-10-07T09:20:41', offsetMinutes: -180 },
      'canon',
      MADRID,
      48,
    );
    expect(new Date(utc ?? 0).toISOString()).toBe('2026-10-07T07:21:29.000Z');
  });

  it('sin hora devuelve null', () => {
    expect(captureUtc({ local: null, offsetMinutes: null }, 'iphone', MADRID, 0)).toBeNull();
  });
});
