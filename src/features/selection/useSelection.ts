import { useCallback, useEffect, useRef, useState } from 'react';

import type { Selection } from '../../../shared/manifest.ts';
import { togglePhoto, type SelectionMap, type ToggleStatus } from './logic.ts';

export type SaveStatus =
  { kind: 'saved' } | { kind: 'pending' } | { kind: 'saving' } | { kind: 'error'; message: string };

/**
 * Estado de la selección con autoguardado: cada cambio se guarda en el servidor local
 * `delayMs` después del último clic (agrupa los cambios rápidos en un solo guardado).
 */
export function useSelection(
  initial: Selection,
  save: (selection: Selection) => Promise<Selection>,
  options: { max: number; order: ReadonlyMap<string, number>; delayMs?: number },
) {
  const { max, order, delayMs = 600 } = options;
  const [places, setPlaces] = useState<SelectionMap>(initial.places);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'saved' });
  const [revision, setRevision] = useState(0);
  const latest = useRef(places);

  useEffect(() => {
    latest.current = places;
  }, [places]);

  useEffect(() => {
    if (revision === 0) return undefined;
    const timer = setTimeout(() => {
      setStatus({ kind: 'saving' });
      const snapshot = latest.current;
      const places = Object.fromEntries(
        Object.entries(snapshot).map(([id, ids]) => [id, [...ids]]),
      );
      save({ version: 1, updatedAt: new Date().toISOString(), places })
        .then(() => {
          // Si hubo más cambios mientras se guardaba, el siguiente guardado ya está programado.
          if (latest.current === snapshot) setStatus({ kind: 'saved' });
        })
        .catch((error: unknown) => {
          setStatus({
            kind: 'error',
            message: error instanceof Error ? error.message : 'No se pudo guardar',
          });
        });
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [revision, delayMs, save]);

  const change = useCallback((next: SelectionMap) => {
    setPlaces(next);
    setStatus({ kind: 'pending' });
    setRevision((r) => r + 1);
  }, []);

  const toggle = useCallback(
    (placeId: string, photoId: string): ToggleStatus => {
      const result = togglePhoto(latest.current, placeId, photoId, max, order);
      if (result.status !== 'limit') {
        latest.current = result.places;
        change(result.places);
      }
      return result.status;
    },
    [change, max, order],
  );

  const setPlace = useCallback(
    (placeId: string, ids: readonly string[]) => {
      const next = { ...latest.current, [placeId]: [...ids] };
      latest.current = next;
      change(next);
    },
    [change],
  );

  return { places, status, toggle, setPlace };
}
