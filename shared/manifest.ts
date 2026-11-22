import { z } from 'zod';

/**
 * Archivos generados por el procesado de fotos (`data/`) y la selección que haces en la app.
 * Compartidos por el procesado, el servidor y la app.
 */

export const OrientationSchema = z.enum(['landscape', 'portrait', 'square']);
export type Orientation = z.infer<typeof OrientationSchema>;

export function orientationOf(width: number, height: number): Orientation {
  const ratio = width / height;
  if (ratio > 1.05) return 'landscape';
  if (ratio < 0.95) return 'portrait';
  return 'square';
}

export const ManifestPhotoSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['canon', 'iphone']),
  /** Archivo principal, relativo a la carpeta `album/`. */
  file: z.string().min(1),
  related: z.array(z.string()),
  edited: z.boolean(),
  /** Instante de captura en UTC (ISO 8601). */
  takenAt: z.string(),
  /** Hora local de Europe/Madrid: `YYYY-MM-DDTHH:mm:ss`. */
  localTime: z.string(),
  gps: z.object({ lat: z.number(), lon: z.number(), approx: z.boolean() }).nullable(),
  placeId: z.string().nullable(),
  /** Distancia (km) al centro de su lugar, si se conoce la posición. */
  distanceToPlaceKm: z.number().nullable(),
  /** Tomada dentro del pueblo o monumento (radio configurado), no en el camino hacia el siguiente. */
  inPlace: z.boolean(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  orientation: OrientationSchema,
  megapixels: z.number().positive(),
  quality: z.object({
    sharpness: z.number(),
    focus: z.number(),
    exposureMean: z.number(),
    clippedHigh: z.number(),
    clippedLow: z.number(),
    phash: z.string().regex(/^[0-9a-f]{16}$/),
    /** Por debajo del umbral de nitidez: probablemente movida o desenfocada. */
    blurry: z.boolean(),
  }),
  /** Grupo de ráfaga o casi duplicado (id de la primera foto del grupo). */
  clusterId: z.string(),
  /** URL de la miniatura (480 px) y de la vista previa (1600 px). */
  thumb: z.string(),
  preview: z.string(),
});
export type ManifestPhoto = z.infer<typeof ManifestPhotoSchema>;

export const ArrivalSchema = z.object({
  placeId: z.string(),
  takenAt: z.string(),
  localTime: z.string(),
  method: z.enum(['radius', 'closest']),
});

export const ManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  canonClockCorrectionSeconds: z.number(),
  arrivals: z.array(ArrivalSchema),
  photos: z.array(ManifestPhotoSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const PlaceCandidatesSchema = z.object({
  placeId: z.string(),
  /** Fotos del viaje asignadas a este lugar. */
  total: z.number().int().nonnegative(),
  /** Preselección (orden cronológico). */
  candidates: z.array(z.string()),
  /** Sugerencia de las 10 para el álbum (subconjunto de `candidates`). */
  suggested: z.array(z.string()),
});
export type PlaceCandidates = z.infer<typeof PlaceCandidatesSchema>;

export const CandidatesSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  selectedPerPlace: z.number().int().positive(),
  places: z.array(PlaceCandidatesSchema),
});
export type Candidates = z.infer<typeof CandidatesSchema>;

/** Tu elección: ids de foto por lugar. */
export const SelectionSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  places: z.record(z.string(), z.array(z.string())),
});
export type Selection = z.infer<typeof SelectionSchema>;
