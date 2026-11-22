import type { SelectionData, SelectionPhoto } from '../../shared/api.ts';
import type { BookConfig } from '../../shared/book.ts';

/** Datos de prueba para la selección: no dependen de tus fotos reales. */

function photo(
  id: string,
  placeId: string,
  localTime: string,
  over: Partial<SelectionPhoto> = {},
): SelectionPhoto {
  return {
    id,
    placeId,
    localTime,
    source: 'iphone',
    orientation: 'landscape',
    width: 4032,
    height: 3024,
    inPlace: false,
    edited: false,
    clusterId: id,
    thumb: `/media/thumbs/${id}.jpg`,
    preview: `/media/preview/${id}.jpg`,
    ...over,
  };
}

/** Datos para el libro: los de la selección más cuatro fotos sin elegir (portada, apertura, separadores). */
export function bookDataFixture(): SelectionData {
  const data = selectionDataFixture();
  return {
    ...data,
    photos: [
      ...data.photos,
      photo('s-cover', 'muxia', '2026-11-04T09:00:00'),
      photo('s-intro', 'muxia', '2026-11-04T09:10:00'),
      photo('s-camino', 'muxia', '2026-11-04T09:20:00'),
      photo('s-epilogo', 'muxia', '2026-11-04T09:30:00'),
    ],
  };
}

export function bookConfigFixture(): BookConfig {
  return {
    meta: {
      title: 'Camino Francés',
      subtitle: 'De Burgos a Muxía',
      author: '',
      dates: 'Octubre – noviembre 2026',
    },
    format: { widthMm: 297, heightMm: 210, marginMm: 14, gutterMm: 18, gapMm: 4, bleedMm: 0 },
    tripStartDate: '2026-10-06',
    photos: {
      cover: 's-cover',
      intro: 's-intro',
      sections: { camino: 's-camino', epilogo: 's-epilogo' },
    },
    sections: {
      camino: { intro: 'De Burgos a Santiago.' },
      epilogo: { intro: 'Después de Santiago, el mar.' },
    },
    places: {
      burgos: { summary: 'Resumen de Burgos.' },
      leon: { summary: 'Resumen de León.' },
      muxia: { summary: 'Resumen de Muxía.' },
    },
    colophon: 'Colofón de prueba.',
  };
}

export function selectionDataFixture(): SelectionData {
  return {
    sections: [
      { id: 'camino', title: 'Camino Francés' },
      { id: 'epilogo', title: 'Epílogo: Fisterra y Muxía' },
    ],
    places: [
      { id: 'burgos', name: 'Burgos', section: 'camino' },
      { id: 'leon', name: 'León', section: 'camino' },
      { id: 'muxia', name: 'Muxía', section: 'epilogo' },
    ],
    selectedPerPlace: 3,
    photos: [
      photo('b1', 'burgos', '2026-10-05T20:44:17', { inPlace: true }),
      photo('b2', 'burgos', '2026-10-06T10:46:00', { source: 'canon' }),
      photo('b3', 'burgos', '2026-10-06T11:27:00', {
        orientation: 'portrait',
        width: 3024,
        height: 4032,
      }),
      photo('b4', 'burgos', '2026-10-07T09:12:00'),
      photo('b5', 'burgos', '2026-10-07T12:16:00'),
      photo('l1', 'leon', '2026-10-14T16:52:00'),
      photo('l2', 'leon', '2026-10-15T14:01:00'),
      photo('m1', 'muxia', '2026-11-04T10:13:00'),
    ],
    candidates: [
      {
        placeId: 'burgos',
        total: 5,
        candidates: ['b1', 'b2', 'b3', 'b4'],
        suggested: ['b1', 'b2'],
      },
      { placeId: 'leon', total: 2, candidates: ['l1', 'l2'], suggested: ['l1', 'l2'] },
      { placeId: 'muxia', total: 1, candidates: ['m1'], suggested: ['m1'] },
    ],
    selection: {
      version: 1,
      updatedAt: '2026-11-22T00:00:00.000Z',
      places: { burgos: ['b1', 'b2'], leon: ['l1', 'l2'], muxia: [] },
    },
  };
}
