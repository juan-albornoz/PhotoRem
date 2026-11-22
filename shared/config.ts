import { z } from 'zod';

/** Esquemas de los archivos de `config/`. Compartidos por el procesado de fotos, el servidor y la app. */

export const PlaceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  section: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Distancia al centro a partir de la cual se considera que ya llegaste al lugar. */
  radiusKm: z.number().positive(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const PlacesConfigSchema = z
  .object({
    sections: z.array(z.object({ id: z.string().min(1), title: z.string().min(1) })).min(1),
    places: z.array(PlaceSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const sectionIds = new Set(config.sections.map((s) => s.id));
    const seen = new Set<string>();
    config.places.forEach((place, index) => {
      if (seen.has(place.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['places', index, 'id'],
          message: `id repetido: ${place.id}`,
        });
      }
      seen.add(place.id);
      if (!sectionIds.has(place.section)) {
        ctx.addIssue({
          code: 'custom',
          path: ['places', index, 'section'],
          message: `sección desconocida: ${place.section}`,
        });
      }
    });
  });
export type PlacesConfig = z.infer<typeof PlacesConfigSchema>;

export const AlbumConfigSchema = z.object({
  sources: z.object({ canon: z.string().min(1), iphone: z.string().min(1) }),
  timeZone: z.string().min(1),
  /**
   * Segundos que hay que sumar al reloj de la Canon para obtener la hora real de Europe/Madrid.
   * Calibrado el 2026-11-22 contra el iPhone: la Canon va 48 s atrasada (su zona «Santiago de Chile» es solo la etiqueta).
   */
  canonClockCorrectionSeconds: z.number().int(),
  preselection: z.object({
    candidatesPerPlace: z.number().int().positive(),
    selectedPerPlace: z.number().int().positive(),
    /** Nitidez mínima (percentil 90 de la varianza del laplaciano por bloques) para no considerar movida una foto. */
    minFocus: z.number().nonnegative(),
  }),
});
export type AlbumConfig = z.infer<typeof AlbumConfigSchema>;

/** Ajustes manuales a la sugerencia automática, por lugar (tras revisar las hojas de contacto). */
export const CurationSchema = z.record(
  z.string(),
  z.object({
    note: z.string().optional(),
    add: z.array(z.string()).default([]),
    remove: z.array(z.string()).default([]),
  }),
);
export type Curation = z.infer<typeof CurationSchema>;
