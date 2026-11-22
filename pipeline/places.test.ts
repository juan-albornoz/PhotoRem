import { describe, expect, it } from 'vitest';

import type { Place } from '../shared/config.ts';
import { buildTrack, haversineKm, locateAt, type Fix } from './geo.ts';
import { assignPlace, computeArrivals, estimateArrival, tripEnd } from './places.ts';

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 17, 8); // 17-oct 10:00 en Madrid

const place = (id: string, lat: number, lon: number, radiusKm = 2): Place => ({
  id,
  name: id,
  section: 'camino',
  lat,
  lon,
  radiusKm,
});

describe('geo', () => {
  it('haversine: Burgos–León son unos 155 km en línea recta', () => {
    expect(haversineKm({ lat: 42.3405, lon: -3.7042 }, { lat: 42.5994, lon: -5.5669 })).toBeCloseTo(
      155,
      -1,
    );
  });

  it('locateAt: exacto cerca de un punto, interpolado entre dos y null lejos de todo', () => {
    const track = buildTrack([
      { t: T0, lat: 42, lon: -6 },
      { t: T0 + 2 * H, lat: 42.2, lon: -6.2 },
    ]);
    expect(locateAt(track, T0 + 60_000)).toEqual({ lat: 42, lon: -6, approx: false });
    const mid = locateAt(track, T0 + H);
    expect(mid?.approx).toBe(true);
    expect(mid?.lat).toBeCloseTo(42.1, 6);
    expect(locateAt(track, T0 + 10 * H)).toBeNull();
  });
});

describe('llegadas y asignación', () => {
  const a = place('a', 42.0, -6.0);
  const b = place('b', 42.0, -6.2); // ~16,5 km al oeste de A
  const track: Fix[] = buildTrack([
    { t: T0, lat: 42.0, lon: -6.0 }, // en A
    { t: T0 + H, lat: 42.0, lon: -6.08 }, // a ~10 km de B
    { t: T0 + 5 * H, lat: 42.0, lon: -6.2 }, // primera foto dentro de B
  ]);

  it('estima la llegada andando desde la última foto anterior', () => {
    const arrivals = computeArrivals([a, b], track);
    expect(arrivals.map((x) => x.placeId)).toEqual(['a', 'b']);
    expect(arrivals[1]?.firstInsideT).toBe(T0 + 5 * H);
    // ~9,9 km − 2 km de radio, ×1,25 por el camino, a 4,5 km/h ≈ 2,2 h después de la foto anterior.
    expect(((arrivals[1]?.t ?? 0) - (T0 + H)) / H).toBeCloseTo(2.2, 1);
  });

  it('no estima si llegarías de noche u otro día (transporte o noche intermedia)', () => {
    const late = Date.UTC(2026, 9, 17, 18); // 20:00 en Madrid
    expect(estimateArrival({ t: late, distanceKm: 30 }, { t: late + 14 * H }, 2)).toBe(
      late + 14 * H,
    );
  });

  it('cada foto va al último lugar al que ya habías llegado', () => {
    const arrivals = computeArrivals([a, b], track);
    const end = tripEnd(b, track);
    expect(assignPlace(arrivals, T0 - H, end)).toBeNull(); // antes de empezar
    expect(assignPlace(arrivals, T0 + 2 * H, end)).toBe('a'); // de camino a B
    expect(assignPlace(arrivals, T0 + 4 * H, end)).toBe('b'); // ya en B, aunque el iPhone no lo registró
    expect(assignPlace(arrivals, end + 1, end)).toBeNull(); // vuelta a casa
  });
});
