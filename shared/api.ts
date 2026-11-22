import { z } from 'zod';

import { OrientationSchema, PlaceCandidatesSchema, SelectionSchema } from './manifest.ts';

/** Contratos de la API local, compartidos por el servidor y la app. */

export interface HealthResponse {
  status: 'ok';
  service: 'album-camino';
  version: string;
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.status === 'ok' &&
    candidate.service === 'album-camino' &&
    typeof candidate.version === 'string'
  );
}

/** Lo justo de cada foto para elegir: la app no necesita el manifiesto completo. */
export const SelectionPhotoSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  localTime: z.string(),
  source: z.enum(['canon', 'iphone']),
  orientation: OrientationSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  inPlace: z.boolean(),
  edited: z.boolean(),
  /** Grupo de ráfaga o casi duplicado: dos fotos del mismo grupo no deben aparecer en el libro. */
  clusterId: z.string(),
  thumb: z.string(),
  preview: z.string(),
});
export type SelectionPhoto = z.infer<typeof SelectionPhotoSchema>;

export const SelectionDataSchema = z.object({
  sections: z.array(z.object({ id: z.string(), title: z.string() })),
  places: z.array(z.object({ id: z.string(), name: z.string(), section: z.string() })),
  selectedPerPlace: z.number().int().positive(),
  photos: z.array(SelectionPhotoSchema),
  candidates: z.array(PlaceCandidatesSchema),
  selection: SelectionSchema,
});
export type SelectionData = z.infer<typeof SelectionDataSchema>;

/** Error de la API con un mensaje para mostrar a la persona. */
export const ApiErrorSchema = z.object({ error: z.string() });
