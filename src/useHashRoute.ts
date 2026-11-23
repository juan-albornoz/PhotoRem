import { useSyncExternalStore } from 'react';

export type Route = 'libro' | 'seleccion' | 'imprimir';

/** `#/seleccion` → 'seleccion'; `#/imprimir?…` → 'imprimir'; cualquier otra cosa (o nada) → 'libro'. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  if (path === 'seleccion') return 'seleccion';
  if (path === 'imprimir') return 'imprimir';
  return 'libro';
}

/** Parámetros tras `?` en el `#`, p. ej. `#/imprimir?calidad=print`. */
export function routeParams(hash: string): URLSearchParams {
  const query = hash.split('?')[1] ?? '';
  return new URLSearchParams(query);
}

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
};

/** Ruta actual según el `#` de la dirección (sin librería de rutas: son pocas pantallas). */
export function useHashRoute(): Route {
  return useSyncExternalStore(
    subscribe,
    () => parseRoute(window.location.hash),
    () => 'libro',
  );
}

/** El `#` completo, para leer sus parámetros. */
export function useHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
}
