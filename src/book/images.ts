import type { SelectionPhoto } from '../../shared/api.ts';
import type { Format, PhotoElement } from '../../shared/book.ts';
import { SCREEN_WIDTHS } from '../../shared/images.ts';

/**
 * Qué imagen pide cada hueco. En pantalla, un `srcset` para que el navegador elija según el tamaño
 * real del hueco y la densidad de la pantalla (también a pantalla completa). En impresión, la foto
 * recortada exactamente al hueco a 300 ppp (o 150), sin ampliar nunca por encima del original.
 */

export type ImageMode =
  | {
      kind: 'screen';
      /** Ancho máximo de una página, en vw (50 en doble página, 100 en simple). */ pageVw: number;
    }
  | { kind: 'print'; dpi: number };

export interface ImageSource {
  src: string;
  srcSet?: string;
  sizes?: string;
  /** En impresión la foto ya viene recortada: se dibuja entera, sin volver a recortar. */
  fit: 'cover' | 'fill';
}

const imageUrl = (id: string, width: number): string =>
  `/api/image?id=${encodeURIComponent(id)}&w=${String(width)}`;

/** Ancho real de la foto escalada para que su lado mayor mida `longSide` (sin ampliar). */
function scaledWidth(photo: Pick<SelectionPhoto, 'width' | 'height'>, longSide: number): number {
  const scale = Math.min(1, longSide / Math.max(photo.width, photo.height));
  return Math.round(photo.width * scale);
}

export function screenSource(
  photo: SelectionPhoto,
  element: PhotoElement,
  format: Format,
  pageVw: number,
): ImageSource {
  const native = Math.max(photo.width, photo.height);
  const candidates: string[] = [];
  for (const w of SCREEN_WIDTHS) {
    candidates.push(`${imageUrl(photo.id, w)} ${String(scaledWidth(photo, w))}w`);
    if (w >= native) break; // las siguientes serían la misma foto (nunca se amplía)
  }
  const fraction = element.box.w / format.widthMm;
  return {
    src: photo.preview,
    srcSet: candidates.join(', '),
    sizes: `${String(Math.max(1, Math.ceil(fraction * pageVw)))}vw`,
    fit: 'cover',
  };
}

/** Píxeles de ancho que necesita un hueco para imprimirse a `dpi`. */
export function printWidthPx(element: PhotoElement, dpi: number): number {
  return Math.ceil((element.box.w / 25.4) * dpi);
}

export function printSource(
  photo: SelectionPhoto,
  element: PhotoElement,
  dpi: number,
): ImageSource {
  const { crop, box } = element;
  const params = new URLSearchParams({
    id: photo.id,
    aspect: (box.w / box.h).toFixed(4),
    cx: crop.centerX.toFixed(3),
    cy: crop.centerY.toFixed(3),
    scale: crop.scale.toFixed(3),
    w: String(printWidthPx(element, dpi)),
  });
  return { src: `/api/image/crop?${params.toString()}`, fit: 'fill' };
}
