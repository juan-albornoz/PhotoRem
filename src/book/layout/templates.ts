import type { Box, Format, TextRole } from '../../../shared/book.ts';

/**
 * Plantillas de página inspiradas en la plantilla de fotolibro horizontal: mucho blanco, títulos
 * grandes, una foto protagonista y combinaciones de 1 a 3 fotos. Todas trabajan en milímetros sobre
 * la caja de contenido de la página (márgenes y lomo ya descontados).
 */

/** Espacio reservado abajo para el folio (número de página, lugar y fecha). */
export const FOLIO_SPACE_MM = 8;

export type Side = 'left' | 'right';

export function contentBox(format: Format, side: Side): Box {
  const x = side === 'left' ? format.marginMm : format.gutterMm;
  return {
    x,
    y: format.marginMm,
    w: format.widthMm - format.marginMm - format.gutterMm,
    h: format.heightMm - 2 * format.marginMm - FOLIO_SPACE_MM,
  };
}

/** Divide una caja en filas (`v`) o columnas (`h`) según fracciones, dejando `gap` entre ellas. */
export function split(
  box: Box,
  direction: 'h' | 'v',
  fractions: readonly number[],
  gap: number,
): Box[] {
  const total = fractions.reduce((a, b) => a + b, 0);
  const length = (direction === 'h' ? box.w : box.h) - gap * (fractions.length - 1);
  const boxes: Box[] = [];
  let offset = 0;
  for (const f of fractions) {
    const size = (length * f) / total;
    boxes.push(
      direction === 'h'
        ? { x: box.x + offset, y: box.y, w: size, h: box.h }
        : { x: box.x, y: box.y + offset, w: box.w, h: size },
    );
    offset += size + gap;
  }
  return boxes;
}

/** Hueco de texto de una plantilla: el contenido lo pone el generador según `slot`. */
export interface TextSlot {
  slot: 'label' | 'date';
  role: TextRole;
  box: Box;
  sizeMm: number;
  align: 'left' | 'center' | 'right';
}

export interface Layout {
  /** Huecos de foto en orden de lectura (izquierda→derecha, arriba→abajo). */
  photos: Box[];
  texts: TextSlot[];
}

export interface ContentTemplate {
  id: string;
  photoCount: number;
  build: (box: Box, gap: number) => Layout;
}

/** Pie de página discreto con el lugar y la fecha, abajo a la derecha de una caja. */
function labelIn(area: Box): TextSlot[] {
  const h = 14;
  return [
    {
      slot: 'label',
      role: 'eyebrow',
      box: { x: area.x, y: area.y + area.h - h, w: area.w, h: 5 },
      sizeMm: 2.6,
      align: 'left',
    },
    {
      slot: 'date',
      role: 'subtitle',
      box: { x: area.x, y: area.y + area.h - h + 6, w: area.w, h: 8 },
      sizeMm: 4.4,
      align: 'left',
    },
  ];
}

export const CONTENT_TEMPLATES: readonly ContentTemplate[] = [
  // — 1 foto —
  {
    id: 'single',
    photoCount: 1,
    build: (box) => ({ photos: [box], texts: [] }),
  },
  {
    id: 'single-portrait',
    photoCount: 1,
    build: (box, gap) => {
      const w = Math.min(box.w * 0.55, box.h * 0.75);
      const photo = { x: box.x, y: box.y, w, h: box.h };
      const rest = { x: box.x + w + gap * 3, y: box.y, w: box.w - w - gap * 3, h: box.h };
      return { photos: [photo], texts: labelIn(rest) };
    },
  },
  // — 2 fotos —
  {
    // Como la plantilla: foto grande arriba, pequeña abajo a la izquierda y texto a su lado.
    id: 'hero-plus',
    photoCount: 2,
    build: (box, gap) => {
      const [top, bottom] = split(box, 'v', [0.62, 0.38], gap);
      if (!top || !bottom) throw new Error('hero-plus');
      const [small, text] = split(bottom, 'h', [0.5, 0.5], gap * 3);
      if (!small || !text) throw new Error('hero-plus');
      return { photos: [top, small], texts: labelIn(text) };
    },
  },
  {
    id: 'two-stack',
    photoCount: 2,
    build: (box, gap) => ({ photos: split(box, 'v', [1, 1], gap), texts: [] }),
  },
  {
    id: 'side-by-side',
    photoCount: 2,
    build: (box, gap) => ({ photos: split(box, 'h', [1, 1], gap), texts: [] }),
  },
  {
    id: 'portrait-left',
    photoCount: 2,
    build: (box, gap) => {
      const [left, right] = split(box, 'h', [0.4, 0.6], gap);
      if (!left || !right) throw new Error('portrait-left');
      const h = Math.min(right.h, right.w / 1.5);
      const landscape = { x: right.x, y: right.y + right.h - h, w: right.w, h };
      const text = { ...right, h: right.h - h - gap };
      return { photos: [left, landscape], texts: text.h > 16 ? labelIn(text) : [] };
    },
  },
  {
    id: 'portrait-right',
    photoCount: 2,
    build: (box, gap) => {
      const [left, right] = split(box, 'h', [0.6, 0.4], gap);
      if (!left || !right) throw new Error('portrait-right');
      const h = Math.min(left.h, left.w / 1.5);
      const landscape = { x: left.x, y: left.y, w: left.w, h };
      const text = { x: left.x, y: left.y + h + gap, w: left.w, h: left.h - h - gap };
      return { photos: [landscape, right], texts: text.h > 16 ? labelIn(text) : [] };
    },
  },
  // — 3 fotos —
  {
    id: 'trio-band',
    photoCount: 3,
    build: (box, gap) => {
      const [top, bottom] = split(box, 'v', [0.55, 0.45], gap);
      if (!top || !bottom) throw new Error('trio-band');
      return { photos: [top, ...split(bottom, 'h', [1, 1], gap)], texts: [] };
    },
  },
  {
    // Como la plantilla: texto arriba a la izquierda, foto a su lado y dos debajo.
    id: 'text-trio',
    photoCount: 3,
    build: (box, gap) => {
      const [top, bottom] = split(box, 'v', [0.45, 0.55], gap);
      if (!top || !bottom) throw new Error('text-trio');
      const [text, photo] = split(top, 'h', [0.38, 0.62], gap * 3);
      if (!text || !photo) throw new Error('text-trio');
      return { photos: [photo, ...split(bottom, 'h', [1, 1], gap)], texts: labelIn(text) };
    },
  },
  {
    id: 'portrait-pair-left',
    photoCount: 3,
    build: (box, gap) => {
      const [left, right] = split(box, 'h', [0.38, 0.62], gap);
      if (!left || !right) throw new Error('portrait-pair-left');
      return { photos: [left, ...split(right, 'v', [1, 1], gap)], texts: [] };
    },
  },
  {
    id: 'portrait-pair-right',
    photoCount: 3,
    build: (box, gap) => {
      const [left, right] = split(box, 'h', [0.62, 0.38], gap);
      if (!left || !right) throw new Error('portrait-pair-right');
      const [a, b] = split(left, 'v', [1, 1], gap);
      if (!a || !b) throw new Error('portrait-pair-right');
      return { photos: [a, b, right], texts: [] };
    },
  },
  {
    id: 'three-portraits',
    photoCount: 3,
    build: (box, gap) => ({ photos: split(box, 'h', [1, 1, 1], gap), texts: [] }),
  },
];

/** Fracción de la foto que se pierde al recortarla para llenar el hueco (0 = encaja perfecta). */
export function cropLoss(photoAspect: number, slotAspect: number): number {
  return 1 - Math.min(photoAspect / slotAspect, slotAspect / photoAspect);
}

/** Coste de poner estas fotos (en orden) en una plantilla: suma de lo que se recorta. */
export function templateCost(
  template: ContentTemplate,
  box: Box,
  gap: number,
  aspects: readonly number[],
): number {
  const { photos } = template.build(box, gap);
  return photos.reduce((sum, slot, i) => sum + cropLoss(aspects[i] ?? 1.5, slot.w / slot.h), 0);
}

/** La plantilla que menos recorta para estas fotos; `avoid` penaliza repetir la anterior. */
export function bestTemplate(
  box: Box,
  gap: number,
  aspects: readonly number[],
  avoid?: string,
): { template: ContentTemplate; cost: number } {
  let best: { template: ContentTemplate; cost: number } | null = null;
  for (const template of CONTENT_TEMPLATES) {
    if (template.photoCount !== aspects.length) continue;
    const cost = templateCost(template, box, gap, aspects) + (template.id === avoid ? 0.08 : 0);
    if (!best || cost < best.cost) best = { template, cost };
  }
  if (!best) throw new Error(`No hay plantilla para ${String(aspects.length)} fotos`);
  return best;
}
