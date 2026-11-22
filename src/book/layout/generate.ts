import type { SelectionData, SelectionPhoto } from '../../../shared/api.ts';
import {
  BookSchema,
  type Book,
  type BookConfig,
  type Box,
  type Page,
  type PageKind,
  type PhotoElement,
  type TextElement,
  type TextRole,
} from '../../../shared/book.ts';
import { dayRange } from '../../features/selection/logic.ts';
import { bestTemplate, contentBox, type Side } from './templates.ts';

/**
 * Generador del libro: convierte tu selección en páginas maquetadas. Orden: lugar → fecha → hora.
 * Estructura: portada · portadilla · apertura + índice · por sección (separador + capítulos) ·
 * colofón · contraportada. Cada capítulo empieza en página izquierda (texto) con su foto principal
 * a la derecha, como en la plantilla.
 */

export interface GenerateInput {
  config: BookConfig;
  data: Pick<SelectionData, 'places' | 'sections' | 'photos'> & {
    selection: Readonly<Record<string, readonly string[]>>;
  };
}

/** Elemento sin id: el id se asigna al colocarlo en su página. */
type Draft = Omit<PhotoElement, 'id'> | Omit<TextElement, 'id'>;

const NO_FRAME = {
  kind: 'none',
  widthMm: 0,
  color: '#ffffff',
  radiusMm: 0,
  shadow: false,
} as const;

function photo(box: Box, photoId: string | null): Draft {
  return {
    type: 'photo',
    box,
    rotationDeg: 0,
    photoId,
    crop: { scale: 1, centerX: 0.5, centerY: 0.5 },
    style: { ...NO_FRAME },
  } satisfies Omit<PhotoElement, 'id'>;
}

function text(
  box: Box,
  role: TextRole,
  value: string,
  sizeMm: number,
  align: TextElement['align'] = 'left',
): Draft {
  return { type: 'text', box, role, text: value, sizeMm, align } satisfies Omit<TextElement, 'id'>;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Número de etapa (día de camino) de una hora local, contando el primer día como 1. */
export function stageNumber(localTime: string, tripStartDate: string): number {
  const [y, m, d] = localTime.slice(0, 10).split('-').map(Number);
  const [sy, sm, sd] = tripStartDate.split('-').map(Number);
  const day = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const start = Date.UTC(sy ?? 1970, (sm ?? 1) - 1, sd ?? 1);
  return Math.floor((day - start) / 86_400_000) + 1;
}

/** «Etapa 3» o «Etapas 1–2» según los días de las fotos (los días antes de empezar no cuentan). */
export function stageLabel(
  photos: readonly Pick<SelectionPhoto, 'localTime'>[],
  start: string,
): string {
  const days = photos.map((p) => stageNumber(p.localTime, start)).filter((d) => d >= 1);
  if (days.length === 0) return '';
  const min = Math.min(...days);
  const max = Math.max(...days);
  return min === max ? `Etapa ${String(min)}` : `Etapas ${String(min)}–${String(max)}`;
}

/** Fecha legible de un conjunto de fotos, p. ej. «5–7 oct 2026». */
function dateLabel(photos: readonly Pick<SelectionPhoto, 'localTime'>[]): string {
  if (photos.length === 0) return '';
  const year =
    [...photos]
      .map((p) => p.localTime)
      .sort()[0]
      ?.slice(0, 4) ?? '';
  return `${dayRange(photos)} ${year}`;
}

/** Líneas que ocupará un título en mayúsculas condensadas (estimación por caracteres). */
export function estimateLines(value: string, widthMm: number, sizeMm: number): number {
  const maxChars = Math.max(1, Math.floor(widthMm / (sizeMm * 0.46)));
  let lines = 1;
  let current = 0;
  for (const word of value.split(/\s+/)) {
    const needed = current === 0 ? word.length : current + 1 + word.length;
    if (needed > maxChars && current > 0) {
      lines += 1;
      current = word.length;
    } else {
      current = needed;
    }
  }
  return lines;
}

/**
 * Reparte `aspects.length` fotos en páginas de 0 a 3 fotos (número par de páginas para no romper
 * las dobles páginas) minimizando lo que se recorta. Las páginas sin fotos se penalizan.
 */
export function partition(aspects: readonly number[], box: Box, gap: number): number[] {
  const k = aspects.length;
  if (k === 0) return [];
  const pages = 2 * Math.ceil(k / 6);
  const memo = new Map<string, number>();
  const pageCost = (start: number, count: number): number => {
    if (count === 0) return 3;
    const key = `${String(start)}:${String(count)}`;
    let cost = memo.get(key);
    if (cost === undefined) {
      cost = bestTemplate(box, gap, aspects.slice(start, start + count)).cost;
      memo.set(key, cost);
    }
    return cost;
  };
  let best: { parts: number[]; cost: number } | null = null;
  const walk = (start: number, remainingPages: number, parts: number[], cost: number): void => {
    if (best && cost >= best.cost) return;
    if (remainingPages === 0) {
      if (start === k) best = { parts: [...parts], cost };
      return;
    }
    const left = k - start;
    for (let count = 0; count <= Math.min(3, left); count += 1) {
      if (left - count > 3 * (remainingPages - 1)) continue;
      parts.push(count);
      walk(start + count, remainingPages - 1, parts, cost + pageCost(start, count));
      parts.pop();
    }
  };
  walk(0, pages, [], 0);
  const result = best as { parts: number[]; cost: number } | null;
  if (!result) throw new Error(`No se pudo repartir ${String(k)} fotos`);
  return result.parts;
}

/** Foto principal del capítulo: la primera tomada en el propio lugar y horizontal; si no, la primera horizontal. */
export function pickMainPhoto(photos: readonly SelectionPhoto[]): SelectionPhoto | undefined {
  return (
    photos.find((p) => p.inPlace && p.orientation === 'landscape') ??
    photos.find((p) => p.orientation === 'landscape') ??
    photos[0]
  );
}

export function generateBook({ config, data }: GenerateInput): Book {
  const { format, meta } = config;
  const W = format.widthMm;
  const H = format.heightMm;
  const gap = format.gapMm;
  const fullBleed: Box = { x: 0, y: 0, w: W, h: H };
  const photosById = new Map(data.photos.map((p) => [p.id, p]));

  // Fotos elegidas por lugar, en orden cronológico (y sin ids desconocidos).
  const chosen = new Map(
    data.places.map((place) => [
      place.id,
      (data.selection[place.id] ?? [])
        .map((id) => photosById.get(id))
        .filter((p): p is SelectionPhoto => p?.placeId === place.id)
        .sort((a, b) => a.localTime.localeCompare(b.localTime)),
    ]),
  );
  const used = new Set([...chosen.values()].flat().map((p) => p.id));
  const usedClusters = new Set([...chosen.values()].flat().map((p) => p.clusterId));
  const free = (p: SelectionPhoto): boolean => !used.has(p.id) && !usedClusters.has(p.clusterId);

  /**
   * Foto especial (portada, separadores) que no se repita con ninguna del libro: ni la misma foto
   * ni otra de su misma ráfaga. Si la preferida no vale, la primera horizontal libre del grupo.
   */
  const special = (
    preferred: string | undefined,
    pool: readonly SelectionPhoto[],
  ): string | null => {
    const candidate = preferred ? photosById.get(preferred) : undefined;
    const pick =
      candidate && free(candidate)
        ? candidate
        : pool.find((p) => free(p) && p.orientation === 'landscape');
    if (!pick) return null;
    used.add(pick.id);
    usedClusters.add(pick.clusterId);
    return pick.id;
  };

  const pages: Page[] = [];
  const push = (
    kind: PageKind,
    templateId: string,
    build: (side: Side) => Draft[],
    info: { sectionId?: string | null; placeId?: string | null; folio: Page['folio'] },
  ): Page => {
    const number = pages.length + 1;
    const side: Side = number % 2 === 1 ? 'right' : 'left';
    const id = `p${String(number)}`;
    const page: Page = {
      id,
      kind,
      templateId,
      number,
      side,
      sectionId: info.sectionId ?? null,
      placeId: info.placeId ?? null,
      folio: info.folio,
      elements: build(side).map((el, i) => ({ ...el, id: `${id}-${String(i)}` })),
    };
    pages.push(page);
    return page;
  };
  /** Las aperturas y separadores empiezan en página izquierda: si toca derecha, se intercala una en blanco. */
  const ensureLeft = (folio: Page['folio']): void => {
    if ((pages.length + 1) % 2 === 1) push('blank', 'blank', () => [], { folio });
  };
  const bookFolio = { place: meta.title, date: meta.dates };

  // — Portada (fuera de la numeración) —
  const allPhotos = [...data.photos];
  const coverPhotoId = special(config.photos.cover, allPhotos);
  const cover: Page = {
    id: 'cover',
    kind: 'cover',
    templateId: 'cover',
    number: null,
    side: 'right',
    sectionId: null,
    placeId: null,
    folio: null,
    elements: [
      // Como la plantilla: título grande en dos líneas arriba a la izquierda y la foto abajo a la derecha.
      text({ x: 16, y: 16, w: 140, h: 6 }, 'eyebrow', 'Camino de Santiago', 2.8),
      text({ x: 16, y: 23, w: 86, h: 54 }, 'title', meta.title, 24),
      text({ x: 16, y: 80, w: 84, h: 10 }, 'subtitle', meta.subtitle, 5),
      ...(meta.author ? [text({ x: 16, y: 92, w: 84, h: 8 }, 'caption', meta.author, 3.2)] : []),
      photo({ x: 106, y: 60, w: W - 106 - 16, h: H - 60 - 16 }, coverPhotoId),
      text({ x: 16, y: H - 40, w: 70, h: 5 }, 'eyebrow', 'Fotografía', 2.8),
      text({ x: 16, y: H - 33, w: 76, h: 16 }, 'caption', meta.dates, 3.2),
    ].map((el, i) => ({ ...el, id: `cover-${String(i)}` })),
  };

  // — Portadilla (página 1, derecha) —
  push(
    'title',
    'title',
    (side) => {
      const cb = contentBox(format, side);
      return [
        text(
          { x: cb.x + 20, y: cb.y + 36, w: cb.w - 40, h: 6 },
          'eyebrow',
          'Camino de Santiago',
          2.8,
        ),
        text({ x: cb.x + 20, y: cb.y + 46, w: cb.w - 40, h: 24 }, 'title', meta.title, 16),
        text({ x: cb.x + 20, y: cb.y + 74, w: cb.w - 40, h: 10 }, 'subtitle', meta.subtitle, 5),
        text({ x: cb.x + 20, y: cb.y + 90, w: cb.w - 40, h: 8 }, 'caption', meta.dates, 3.2),
        ...(meta.author
          ? [text({ x: cb.x + 20, y: cb.y + 100, w: cb.w - 40, h: 8 }, 'caption', meta.author, 3.2)]
          : []),
      ];
    },
    { folio: bookFolio },
  );

  // — Apertura: foto a sangre (izquierda) + índice (derecha, se rellena al final) —
  const introPhotoId = special(config.photos.intro, allPhotos);
  push('divider', 'full-photo', () => [photo(fullBleed, introPhotoId)], { folio: bookFolio });
  const indexPage = push('index', 'index', () => [], { folio: bookFolio });
  const openingNumbers = new Map<string, number>();

  // — Secciones y capítulos —
  let chapter = 0;
  for (const section of data.sections) {
    const sectionPlaces = data.places.filter((p) => p.section === section.id);
    if (sectionPlaces.length === 0) continue;
    const sectionFolio = { place: section.title, date: meta.dates };
    const sectionPool = sectionPlaces.flatMap((p) =>
      data.photos.filter((ph) => ph.placeId === p.id),
    );
    const isEpilogue = section.id !== data.sections[0]?.id;

    ensureLeft(sectionFolio);
    push(
      'divider',
      'divider-text',
      (side) => {
        const cb = contentBox(format, side);
        const intro = config.sections[section.id]?.intro ?? '';
        return [
          text({ x: cb.x, y: cb.y, w: 34, h: cb.h }, 'vertical', section.title, 17),
          text(
            { x: cb.x + 60, y: cb.y + cb.h - 66, w: 120, h: 6 },
            'eyebrow',
            isEpilogue ? 'Epílogo' : 'El Camino',
            2.8,
          ),
          text({ x: cb.x + 60, y: cb.y + cb.h - 56, w: 120, h: 56 }, 'body', intro, 3.6),
        ];
      },
      { sectionId: section.id, folio: sectionFolio },
    );
    const dividerPhotoId = special(config.photos.sections[section.id], sectionPool);
    push('divider', 'full-photo', () => [photo(fullBleed, dividerPhotoId)], {
      sectionId: section.id,
      folio: sectionFolio,
    });

    for (const place of sectionPlaces) {
      const photos = chosen.get(place.id) ?? [];
      if (!isEpilogue) chapter += 1;
      const main = pickMainPhoto(photos);
      const rest = photos.filter((p) => p !== main);
      const placeFolio = { place: place.name, date: dateLabel(photos) };
      const stage = stageLabel(photos, config.tripStartDate);
      const eyebrow = isEpilogue
        ? ['Epílogo', stage].filter(Boolean).join(' · ')
        : [`Capítulo ${pad2(chapter)}`, stage].filter(Boolean).join(' · ');

      ensureLeft(placeFolio);
      const opening = push(
        'opening',
        'opening-text',
        (side) => {
          const cb = contentBox(format, side);
          const size = place.name.length > 14 ? 18 : 22;
          const lines = estimateLines(place.name.toUpperCase(), cb.w, size);
          const titleH = lines * size * 1.08;
          const summary = config.places[place.id]?.summary ?? '';
          return [
            text({ x: cb.x, y: cb.y + 2, w: cb.w, h: 6 }, 'eyebrow', eyebrow, 2.8),
            text({ x: cb.x, y: cb.y + 12, w: cb.w, h: titleH }, 'display', place.name, size),
            text({ x: cb.x, y: cb.y + 16 + titleH, w: cb.w, h: 8 }, 'subtitle', placeFolio.date, 5),
            text({ x: cb.x, y: cb.y + cb.h - 60, w: cb.w * 0.56, h: 60 }, 'body', summary, 3.4),
          ];
        },
        { sectionId: section.id, placeId: place.id, folio: placeFolio },
      );
      openingNumbers.set(place.id, opening.number ?? 0);
      push(
        'opening',
        'opening-photo',
        (side) => [photo(contentBox(format, side), main?.id ?? null)],
        { sectionId: section.id, placeId: place.id, folio: placeFolio },
      );

      // Páginas de contenido: el resto de fotos, en orden, con la plantilla que menos recorta.
      const aspects = rest.map((p) => p.width / p.height);
      const parts = partition(aspects, contentBox(format, 'left'), gap);
      let start = 0;
      let previous: string | undefined;
      for (const count of parts) {
        const pagePhotos = rest.slice(start, start + count);
        start += count;
        const pageFolio = {
          place: place.name,
          date: dateLabel(pagePhotos.length ? pagePhotos : photos),
        };
        if (count === 0) {
          push(
            'content',
            'note',
            (side) => {
              const cb = contentBox(format, side);
              return [
                text({ x: cb.x, y: cb.y + cb.h - 14, w: cb.w, h: 5 }, 'eyebrow', place.name, 2.6),
                text(
                  { x: cb.x, y: cb.y + cb.h - 8, w: cb.w, h: 8 },
                  'subtitle',
                  pageFolio.date,
                  4.4,
                ),
              ];
            },
            { sectionId: section.id, placeId: place.id, folio: pageFolio },
          );
          continue;
        }
        const { template } = bestTemplate(
          contentBox(format, 'left'),
          gap,
          aspects.slice(start - count, start),
          previous,
        );
        previous = template.id;
        push(
          'content',
          template.id,
          (side) => {
            const layout = template.build(contentBox(format, side), gap);
            return [
              ...layout.photos.map((box, i) => photo(box, pagePhotos[i]?.id ?? null)),
              ...layout.texts.map((slot) =>
                text(
                  slot.box,
                  slot.role,
                  slot.slot === 'label' ? place.name : pageFolio.date,
                  slot.sizeMm,
                  slot.align,
                ),
              ),
            ];
          },
          { sectionId: section.id, placeId: place.id, folio: pageFolio },
        );
      }
    }
  }

  // — Colofón (izquierda) y cierre (derecha) —
  ensureLeft(bookFolio);
  push(
    'colophon',
    'colophon',
    (side) => {
      const cb = contentBox(format, side);
      return [
        text({ x: cb.x, y: cb.y + cb.h - 40, w: 110, h: 6 }, 'eyebrow', 'Colofón', 2.8),
        text({ x: cb.x, y: cb.y + cb.h - 32, w: 110, h: 32 }, 'caption', config.colophon, 3),
      ];
    },
    { folio: bookFolio },
  );
  push(
    'blank',
    'end',
    (side) => {
      const cb = contentBox(format, side);
      return [
        text(
          { x: cb.x, y: cb.y + cb.h / 2 - 8, w: cb.w, h: 16 },
          'title',
          'Buen Camino',
          10,
          'center',
        ),
      ];
    },
    { folio: bookFolio },
  );

  // — Índice: ahora que se conocen los números de página —
  const indexBox = contentBox(format, indexPage.side);
  const indexEls: Draft[] = [
    text({ x: indexBox.x, y: indexBox.y, w: indexBox.w, h: 18 }, 'title', 'Índice', 14),
  ];
  const columns = data.sections.filter((s) => data.places.some((p) => p.section === s.id));
  const colW = (indexBox.w - 12) / Math.max(1, columns.length);
  let chapterNumber = 0;
  columns.forEach((section, c) => {
    const x = indexBox.x + c * (colW + 12);
    let y = indexBox.y + 30;
    indexEls.push(text({ x, y, w: colW, h: 6 }, 'eyebrow', section.title, 2.6));
    y += 10;
    for (const place of data.places.filter((p) => p.section === section.id)) {
      const first = c === 0;
      if (first) chapterNumber += 1;
      const page = openingNumbers.get(place.id) ?? 0;
      indexEls.push(
        text({ x, y, w: 10, h: 7 }, 'index', first ? pad2(chapterNumber) : '·', 3.4),
        text({ x: x + 11, y, w: colW - 24, h: 7 }, 'index', place.name, 3.4),
        text({ x: x + colW - 12, y, w: 12, h: 7 }, 'index', String(page), 3.4, 'right'),
      );
      y += 8;
    }
  });
  indexPage.elements = indexEls.map((el, i) => ({ ...el, id: `${indexPage.id}-${String(i)}` }));

  const back: Page = {
    id: 'back',
    kind: 'back',
    templateId: 'back',
    number: null,
    side: 'left',
    sectionId: null,
    placeId: null,
    folio: null,
    elements: [
      text(
        { x: 16, y: H - 30, w: W - 32, h: 6 },
        'eyebrow',
        `${meta.title} · ${meta.subtitle}`,
        2.8,
        'center',
      ),
      text({ x: 16, y: H - 23, w: W - 32, h: 6 }, 'caption', meta.dates, 3, 'center'),
    ].map((el, i) => ({ ...el, id: `back-${String(i)}` })),
  };

  // Comprobación: el libro cumple el esquema (lo mismo que se guardará y exportará).
  return BookSchema.parse({ version: 1, format, meta, cover, back, pages });
}
