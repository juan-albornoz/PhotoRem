import {
  ApiErrorSchema,
  SelectionDataSchema,
  isHealthResponse,
  type HealthResponse,
  type SelectionData,
} from '../../shared/api.ts';
import {
  BookConfigSchema,
  LayoutOverridesSchema,
  type BookConfig,
  type LayoutOverrides,
} from '../../shared/book.ts';
import { SelectionSchema, type Selection } from '../../shared/manifest.ts';

/** Error de la API local con un mensaje pensado para mostrar en pantalla. */
export class ApiError extends Error {}

async function errorFrom(response: Response): Promise<ApiError> {
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) return new ApiError(parsed.data.error);
  } catch {
    // La respuesta no era JSON: usamos el mensaje genérico.
  }
  return new ApiError(`El servidor local respondió ${String(response.status)}`);
}

/** Consulta el estado del servidor local. Lanza un error si no responde o la respuesta no es válida. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal: signal ?? null });
  if (!response.ok) throw await errorFrom(response);
  const body: unknown = await response.json();
  if (!isHealthResponse(body)) throw new ApiError('Respuesta inesperada del servidor local');
  return body;
}

export async function fetchSelectionData(signal?: AbortSignal): Promise<SelectionData> {
  const response = await fetch('/api/selection-data', { signal: signal ?? null });
  if (!response.ok) throw await errorFrom(response);
  const parsed = SelectionDataSchema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError('Los datos de las fotos no tienen el formato esperado');
  return parsed.data;
}

export async function fetchBookConfig(signal?: AbortSignal): Promise<BookConfig> {
  const response = await fetch('/api/book-config', { signal: signal ?? null });
  if (!response.ok) throw await errorFrom(response);
  const parsed = BookConfigSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new ApiError('La configuración del libro no tiene el formato esperado');
  return parsed.data;
}

export async function fetchLayout(signal?: AbortSignal): Promise<LayoutOverrides> {
  const response = await fetch('/api/layout', { signal: signal ?? null });
  if (!response.ok) throw await errorFrom(response);
  const parsed = LayoutOverridesSchema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError('El orden de las fotos no tiene el formato esperado');
  return parsed.data;
}

export async function saveLayout(layout: LayoutOverrides): Promise<LayoutOverrides> {
  const response = await fetch('/api/layout', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(layout),
  });
  if (!response.ok) throw await errorFrom(response);
  const parsed = LayoutOverridesSchema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError('Respuesta inesperada al guardar el orden de las fotos');
  return parsed.data;
}

/** Pide al servidor local el PDF del libro (puede tardar unos minutos la primera vez). */
export async function exportBookPdf(quality: 'print' | 'light'): Promise<Blob> {
  const response = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quality }),
  });
  if (!response.ok) throw await errorFrom(response);
  return response.blob();
}

export async function saveSelection(selection: Selection): Promise<Selection> {
  const response = await fetch('/api/selection', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(selection),
  });
  if (!response.ok) throw await errorFrom(response);
  const parsed = SelectionSchema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError('Respuesta inesperada al guardar la selección');
  return parsed.data;
}
