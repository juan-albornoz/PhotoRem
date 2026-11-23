/** Iconos mínimos (trazo fino, `currentColor`). Decorativos: el nombre accesible lo lleva el botón. */

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export function ChevronLeft() {
  return (
    <svg {...base}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ChevronRight() {
  return (
    <svg {...base}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Cuatro esquinas hacia fuera. */
export function Expand() {
  return (
    <svg {...base}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

/** Cuatro esquinas hacia dentro. */
export function Collapse() {
  return (
    <svg {...base}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  );
}

/** Altavoz con ondas: sonido activado. */
export function SoundOn() {
  return (
    <svg {...base}>
      <path d="M4 10v4h3l4 3.5v-11L7 10H4z" />
      <path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
    </svg>
  );
}

/** Altavoz tachado: sonido desactivado. */
export function SoundOff() {
  return (
    <svg {...base}>
      <path d="M4 10v4h3l4 3.5v-11L7 10H4z" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </svg>
  );
}
