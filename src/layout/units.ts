/**
 * Unidades de impresión. El modelo del álbum guarda todas las medidas en milímetros;
 * la pantalla las escala y el PDF las usa tal cual.
 */

export const MM_PER_INCH = 25.4;

/** Resolución mínima exigida para imprimir. */
export const PRINT_DPI = 300;

export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}

export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH;
}

/** Puntos por pulgada efectivos de un recorte de `cropPx` píxeles impreso a `printedMm` milímetros. */
export function effectiveDpi(cropPx: number, printedMm: number): number {
  if (!(printedMm > 0)) {
    throw new RangeError(
      `El tamaño impreso debe ser mayor que 0 mm (recibido: ${String(printedMm)})`,
    );
  }
  if (!(cropPx >= 0)) {
    throw new RangeError(
      `Los píxeles del recorte no pueden ser negativos (recibido: ${String(cropPx)})`,
    );
  }
  return cropPx / (printedMm / MM_PER_INCH);
}

/** Indica si el recorte llega a la resolución mínima de impresión. */
export function meetsPrintDpi(cropPx: number, printedMm: number, minDpi = PRINT_DPI): boolean {
  return effectiveDpi(cropPx, printedMm) >= minDpi;
}
