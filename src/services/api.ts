import { isHealthResponse, type HealthResponse } from '../../shared/api.ts';

/** Consulta el estado del servidor local. Lanza un error si no responde o la respuesta no es válida. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal: signal ?? null });
  if (!response.ok) {
    throw new Error(`El servidor local respondió ${String(response.status)}`);
  }
  const body: unknown = await response.json();
  if (!isHealthResponse(body)) {
    throw new Error('Respuesta inesperada del servidor local');
  }
  return body;
}
