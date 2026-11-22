import { describe, expect, it } from 'vitest';

import type { SelectionPhoto } from '../../../shared/api.ts';
import type { Book, Page, PhotoElement } from '../../../shared/book.ts';
import { bookConfigFixture } from '../../test/fixtures.ts';
import {
  estimateLines,
  generateBook,
  partition,
  pickMainPhoto,
  stageLabel,
  stageNumber,
  type GenerateInput,
} from './generate.ts';
import { bestTemplate, contentBox, cropLoss } from './templates.ts';

const L = { width: 6000, height: 4000 }; // horizontal 3:2
const P = { width: 3024, height: 4032 }; // vertical 3:4

function photo(
  id: string,
  placeId: string,
  minute: number,
  size = L,
  over: Partial<SelectionPhoto> = {},
): SelectionPhoto {
  const day = 6 + Math.floor(minute / 600);
  const m = minute % 600;
  return {
    id,
    placeId,
    localTime: `2026-10-${String(day).padStart(2, '0')}T${String(8 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`,
    source: 'iphone',
    orientation: size.width > size.height ? 'landscape' : 'portrait',
    ...size,
    inPlace: false,
    edited: false,
    clusterId: id,
    thumb: `/media/thumbs/${id}.jpg`,
    preview: `/media/preview/${id}.jpg`,
    ...over,
  };
}

/** Tres lugares (dos del Camino y uno del epílogo) con 10 fotos cada uno, mezclando orientaciones. */
function input(
  counts: Record<string, number> = { burgos: 10, leon: 10, muxia: 10 },
): GenerateInput {
  const orientations = [L, L, P, L, L, P, P, L, L, L];
  const photos: SelectionPhoto[] = [];
  const selection: Record<string, string[]> = {};
  Object.entries(counts).forEach(([placeId, n], placeIndex) => {
    selection[placeId] = [];
    for (let i = 0; i < n; i += 1) {
      const p = photo(
        `${placeId}-${String(i)}`,
        placeId,
        placeIndex * 1200 + i * 30,
        orientations[i % 10],
        {
          inPlace: i === 2,
        },
      );
      photos.push(p);
      selection[placeId].push(p.id);
    }
  });
  for (const id of ['s-cover', 's-intro', 's-camino', 's-epilogo'])
    photos.push(photo(id, 'muxia', 3000));
  return {
    config: bookConfigFixture(),
    data: {
      sections: [
        { id: 'camino', title: 'Camino Francés' },
        { id: 'epilogo', title: 'Epílogo: Fisterra y Muxía' },
      ],
      places: [
        { id: 'burgos', name: 'Burgos', section: 'camino' },
        { id: 'leon', name: 'León', section: 'camino' },
        { id: 'muxia', name: 'Muxía', section: 'epilogo' },
      ],
      photos,
      selection,
    },
  };
}

const photoIds = (pages: readonly Page[]): string[] =>
  pages.flatMap((p) =>
    p.elements
      .filter((e): e is PhotoElement => e.type === 'photo')
      .flatMap((e) => (e.photoId ? [e.photoId] : [])),
  );

describe('generateBook: estructura', () => {
  const book: Book = generateBook(input());

  it('numera las páginas, la 1 a la derecha y después alternando', () => {
    book.pages.forEach((page, i) => {
      expect(page.number).toBe(i + 1);
      expect(page.side).toBe((i + 1) % 2 === 1 ? 'right' : 'left');
    });
    // Termina en página derecha: el libro cierra bien (portada, interiores en pares, contraportada).
    expect(book.pages.at(-1)?.side).toBe('right');
  });

  it('cada capítulo abre en doble página: texto a la izquierda y su foto principal a la derecha', () => {
    for (const placeId of ['burgos', 'leon', 'muxia']) {
      const i = book.pages.findIndex(
        (p) => p.placeId === placeId && p.templateId === 'opening-text',
      );
      expect(book.pages[i]?.side).toBe('left');
      expect(book.pages[i + 1]?.templateId).toBe('opening-photo');
      expect(book.pages[i + 1]?.side).toBe('right');
    }
  });

  it('pone cada foto elegida una sola vez y ninguna foto se repite en todo el libro', () => {
    const all = photoIds([book.cover, ...book.pages, book.back]);
    expect(new Set(all).size).toBe(all.length);
    const selected = Object.values(input().data.selection).flat();
    for (const id of selected) expect(all.filter((x) => x === id)).toHaveLength(1);
    expect(all).toEqual(expect.arrayContaining(['s-cover', 's-intro', 's-camino', 's-epilogo']));
  });

  it('respeta el orden cronológico dentro de cada capítulo', () => {
    const byId = new Map(input().data.photos.map((p) => [p.id, p]));
    for (const placeId of ['burgos', 'leon', 'muxia']) {
      const content = book.pages.filter((p) => p.placeId === placeId && p.kind === 'content');
      const times = photoIds(content).map((id) => byId.get(id)?.localTime ?? '');
      expect(times).toEqual([...times].sort());
    }
  });

  it('todas las páginas interiores llevan número, lugar y fecha en el folio', () => {
    for (const page of book.pages) {
      expect(page.number).not.toBeNull();
      expect(page.folio?.place).toBeTruthy();
      expect(page.folio?.date).toBeTruthy();
    }
    const opening = book.pages.find((p) => p.placeId === 'burgos');
    expect(opening?.folio).toEqual({ place: 'Burgos', date: '6 oct 2026' });
  });

  it('ningún elemento se sale de la página', () => {
    const { widthMm: W, heightMm: H } = book.format;
    for (const page of [book.cover, ...book.pages, book.back]) {
      for (const el of page.elements) {
        expect(el.box.x).toBeGreaterThanOrEqual(0);
        expect(el.box.y).toBeGreaterThanOrEqual(0);
        expect(el.box.x + el.box.w).toBeLessThanOrEqual(W + 0.001);
        expect(el.box.y + el.box.h).toBeLessThanOrEqual(H + 0.001);
      }
    }
  });

  it('el índice apunta a la página donde empieza cada capítulo', () => {
    const index = book.pages.find((p) => p.kind === 'index');
    const texts = index?.elements.flatMap((e) => (e.type === 'text' ? [e.text] : [])) ?? [];
    const leonOpening = book.pages.find(
      (p) => p.placeId === 'leon' && p.templateId === 'opening-text',
    );
    const i = texts.indexOf('León');
    expect(texts[i + 1]).toBe(String(leonOpening?.number));
  });

  it('separa el epílogo con su página separadora', () => {
    const divider = book.pages.find(
      (p) => p.sectionId === 'epilogo' && p.templateId === 'divider-text',
    );
    expect(divider?.side).toBe('left');
    const firstEpilogue = book.pages.findIndex((p) => p.placeId === 'muxia');
    if (!divider) throw new Error('falta el separador del epílogo');
    expect(book.pages.indexOf(divider)).toBeLessThan(firstEpilogue);
  });

  it('el capítulo lleva su número y sus etapas', () => {
    const opening = book.pages.find((p) => p.placeId === 'leon' && p.templateId === 'opening-text');
    const eyebrow = opening?.elements.find((e) => e.type === 'text' && e.role === 'eyebrow');
    expect(eyebrow?.type === 'text' ? eyebrow.text : '').toBe('Capítulo 02 · Etapa 3');
  });
});

describe('generateBook: casos límite', () => {
  it('con pocas fotos genera el capítulo igualmente y mantiene las dobles páginas', () => {
    const book = generateBook(input({ burgos: 1, leon: 4, muxia: 0 }));
    expect(book.pages.at(-1)?.side).toBe('right');
    expect(book.pages.filter((p) => p.placeId === 'burgos')).toHaveLength(2); // solo la apertura
    expect(book.pages.filter((p) => p.placeId === 'leon' && p.kind === 'content')).toHaveLength(2);
  });

  it('si la foto de portada también está elegida en un capítulo, usa otra libre', () => {
    const data = input();
    data.config.photos.cover = 'burgos-0';
    const book = generateBook(data);
    const cover = book.cover.elements.find((e): e is PhotoElement => e.type === 'photo');
    expect(cover?.photoId).not.toBe('burgos-0');
    expect(cover?.photoId).toBeTruthy();
  });

  it('tampoco usa para la portada otra foto de la misma ráfaga que una elegida', () => {
    const data = input();
    const cover = data.data.photos.find((p) => p.id === 's-cover');
    if (cover) cover.clusterId = 'burgos-1';
    const book = generateBook(data);
    const used = book.cover.elements.find((e): e is PhotoElement => e.type === 'photo');
    expect(used?.photoId).not.toBe('s-cover');
  });
});

describe('maquetación', () => {
  const box = contentBox(bookConfigFixture().format, 'left');

  it('mide lo que se recorta', () => {
    expect(cropLoss(1.5, 1.5)).toBe(0);
    expect(cropLoss(0.75, 1.5)).toBeCloseTo(0.5, 6);
  });

  it('elige plantillas de verticales para fotos verticales', () => {
    expect(bestTemplate(box, 4, [0.75, 0.75, 0.75]).template.id).toBe('three-portraits');
    expect(bestTemplate(box, 4, [0.75, 1.5, 1.5]).template.id).toBe('portrait-pair-left');
    expect(bestTemplate(box, 4, [0.75, 0.75]).template.id).toBe('side-by-side');
  });

  it('reparte 9 fotos en 4 páginas de 1 a 3 fotos', () => {
    const parts = partition([1.5, 1.5, 0.75, 1.5, 1.5, 0.75, 0.75, 1.5, 1.5], box, 4);
    expect(parts).toHaveLength(4);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9);
    expect(parts.every((n) => n >= 1 && n <= 3)).toBe(true);
  });

  it('foto principal: la primera horizontal tomada en el propio lugar', () => {
    const photos = [
      photo('a', 'x', 0, P, { inPlace: true }),
      photo('b', 'x', 1),
      photo('c', 'x', 2, L, { inPlace: true }),
    ];
    expect(pickMainPhoto(photos)?.id).toBe('c');
    expect(pickMainPhoto([photo('a', 'x', 0, P)])?.id).toBe('a');
  });

  it('cuenta etapas desde el primer día de camino', () => {
    expect(stageNumber('2026-10-06T10:00:00', '2026-10-06')).toBe(1);
    expect(stageNumber('2026-10-05T20:00:00', '2026-10-06')).toBe(0);
    expect(
      stageLabel(
        [{ localTime: '2026-10-05T20:00:00' }, { localTime: '2026-10-07T10:00:00' }],
        '2026-10-06',
      ),
    ).toBe('Etapa 2');
    expect(
      stageLabel(
        [{ localTime: '2026-10-06T10:00:00' }, { localTime: '2026-10-07T10:00:00' }],
        '2026-10-06',
      ),
    ).toBe('Etapas 1–2');
  });

  it('estima en cuántas líneas cabe un título', () => {
    expect(estimateLines('BURGOS', 265, 22)).toBe(1);
    expect(estimateLines('SANTIAGO DE COMPOSTELA', 265, 18)).toBe(1);
    expect(estimateLines('SANTIAGO DE COMPOSTELA', 120, 18)).toBe(2);
  });
});
