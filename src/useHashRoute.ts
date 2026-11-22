import { useSyncExternalStore } from 'react';

export type Route = 'libro' | 'seleccion';

/** `#/seleccion` → 'seleccion'; cualquier otra cosa (o nada) → 'libro'. */
export function parseRoute(hash: string): Route {
  return hash.replace(/^#\/?/, '') === 'seleccion' ? 'seleccion' : 'libro';
}

/** Ruta actual según el `#` de la dirección (sin librería de rutas: solo hay dos pantallas). */
export function useHashRoute(): Route {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange);
      return () => {
        window.removeEventListener('hashchange', onChange);
      };
    },
    () => parseRoute(window.location.hash),
    () => 'libro',
  );
}
