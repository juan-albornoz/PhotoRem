import { z } from 'zod';

/**
 * Modelo del libro, serializable: libro → páginas → elementos (huecos de foto y bloques de texto).
 * Todas las medidas en milímetros: la pantalla las escala y el PDF las usa tal cual.
 */

export const FormatSchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  /** Margen exterior, superior e inferior. */
  marginMm: z.number().nonnegative(),
  /** Margen interior (junto al lomo). */
  gutterMm: z.number().nonnegative(),
  /** Espacio entre huecos de foto. */
  gapMm: z.number().nonnegative(),
  bleedMm: z.union([z.literal(0), z.literal(3)]),
});
export type Format = z.infer<typeof FormatSchema>;

export const BoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});
export type Box = z.infer<typeof BoxSchema>;

/** Encuadre dentro del hueco: nunca deforma la foto (escala ≥ 1 sobre el ajuste «cubrir»). */
export const CropSchema = z.object({
  scale: z.number().min(1),
  centerX: z.number().min(0).max(1),
  centerY: z.number().min(0).max(1),
});

export const FrameStyleSchema = z.object({
  kind: z.enum(['none', 'thin', 'passepartout', 'polaroid', 'rounded']),
  widthMm: z.number().nonnegative(),
  color: z.string(),
  radiusMm: z.number().nonnegative(),
  shadow: z.boolean(),
});
export type FrameStyle = z.infer<typeof FrameStyleSchema>;

export const PhotoElementSchema = z.object({
  type: z.literal('photo'),
  id: z.string(),
  box: BoxSchema,
  rotationDeg: z.number(),
  photoId: z.string().nullable(),
  crop: CropSchema,
  style: FrameStyleSchema,
  caption: z.string().optional(),
});
export type PhotoElement = z.infer<typeof PhotoElementSchema>;

export const TextRoleSchema = z.enum([
  'display',
  'title',
  'subtitle',
  'eyebrow',
  'body',
  'caption',
  'vertical',
  'index',
]);
export type TextRole = z.infer<typeof TextRoleSchema>;

export const TextElementSchema = z.object({
  type: z.literal('text'),
  id: z.string(),
  box: BoxSchema,
  role: TextRoleSchema,
  text: z.string(),
  /** Tamaño de letra en mm (la pantalla lo escala con la página). */
  sizeMm: z.number().positive(),
  align: z.enum(['left', 'center', 'right']),
});
export type TextElement = z.infer<typeof TextElementSchema>;

export const ElementSchema = z.discriminatedUnion('type', [PhotoElementSchema, TextElementSchema]);
export type Element = z.infer<typeof ElementSchema>;

export const PageKindSchema = z.enum([
  'cover',
  'title',
  'index',
  'divider',
  'opening',
  'content',
  'colophon',
  'blank',
  'back',
]);
export type PageKind = z.infer<typeof PageKindSchema>;

export const PageSchema = z.object({
  id: z.string(),
  kind: PageKindSchema,
  templateId: z.string(),
  /** Número de página (folio). Las cubiertas no llevan. */
  number: z.number().int().positive().nullable(),
  side: z.enum(['left', 'right']),
  sectionId: z.string().nullable(),
  placeId: z.string().nullable(),
  /** Lugar y fecha que se muestran en el folio, de forma discreta. */
  folio: z.object({ place: z.string(), date: z.string() }).nullable(),
  elements: z.array(ElementSchema),
});
export type Page = z.infer<typeof PageSchema>;

export const BookSchema = z.object({
  version: z.literal(1),
  format: FormatSchema,
  meta: z.object({
    title: z.string(),
    subtitle: z.string(),
    author: z.string(),
    dates: z.string(),
  }),
  cover: PageSchema,
  back: PageSchema,
  /** Páginas interiores en orden. La 1 es una página derecha; después van por pares (izquierda, derecha). */
  pages: z.array(PageSchema),
});
export type Book = z.infer<typeof BookSchema>;

/** Contenido editable del libro (`config/book.json`): textos, fotos especiales y formato. */
export const BookConfigSchema = z.object({
  meta: z.object({
    title: z.string(),
    subtitle: z.string(),
    author: z.string(),
    dates: z.string(),
  }),
  format: FormatSchema,
  /** Primer día de camino (Etapa 1). */
  tripStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Fotos que no son de ningún capítulo: portada, apertura del libro y separadores de sección. */
  photos: z.object({
    cover: z.string(),
    intro: z.string(),
    sections: z.record(z.string(), z.string()),
  }),
  sections: z.record(z.string(), z.object({ intro: z.string() })),
  places: z.record(z.string(), z.object({ summary: z.string() })),
  colophon: z.string(),
});
export type BookConfig = z.infer<typeof BookConfigSchema>;
