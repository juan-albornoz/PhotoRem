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
