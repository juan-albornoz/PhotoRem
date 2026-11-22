import type { CSSProperties } from 'react';

import type { SelectionPhoto } from '../../shared/api.ts';
import type { Box, Format, Page, PhotoElement, TextElement } from '../../shared/book.ts';
import { formatLocalTime } from '../features/selection/logic.ts';

interface BookPageProps {
  page: Page;
  format: Format;
  photosById: ReadonlyMap<string, SelectionPhoto>;
  placeNames: ReadonlyMap<string, string>;
}

/** Posición de una caja en % de la página: la misma página sirve a cualquier tamaño (y para el PDF). */
function position(box: Box, format: Format): CSSProperties {
  return {
    left: `${String((box.x / format.widthMm) * 100)}%`,
    top: `${String((box.y / format.heightMm) * 100)}%`,
    width: `${String((box.w / format.widthMm) * 100)}%`,
    height: `${String((box.h / format.heightMm) * 100)}%`,
  };
}

/** Tamaño de letra en mm → unidades de contenedor (ancho de la página). */
function fontSize(sizeMm: number, format: Format): string {
  return `${String((sizeMm / format.widthMm) * 100)}cqw`;
}

function photoAlt(photo: SelectionPhoto, placeNames: ReadonlyMap<string, string>): string {
  const { day, time } = formatLocalTime(photo.localTime);
  const place = placeNames.get(photo.placeId) ?? '';
  return `${place}, ${day} a las ${time} (${photo.source === 'canon' ? 'Canon' : 'iPhone'})`;
}

function PhotoSlot({
  element,
  format,
  photo,
  alt,
}: {
  element: PhotoElement;
  format: Format;
  photo: SelectionPhoto | undefined;
  alt: string;
}) {
  const { crop } = element;
  return (
    <div className="book-photo" style={position(element.box, format)}>
      {photo ? (
        <img
          src={photo.preview}
          alt={alt}
          loading="lazy"
          decoding="async"
          style={{
            objectPosition: `${String(crop.centerX * 100)}% ${String(crop.centerY * 100)}%`,
            transform: crop.scale > 1 ? `scale(${String(crop.scale)})` : undefined,
          }}
        />
      ) : (
        <span className="book-photo__missing">Foto no disponible</span>
      )}
    </div>
  );
}

function TextSlot({ element, format }: { element: TextElement; format: Format }) {
  return (
    <div
      className={`book-text book-text--${element.role}`}
      style={{
        ...position(element.box, format),
        fontSize: fontSize(element.sizeMm, format),
        textAlign: element.align,
      }}
    >
      {element.text}
    </div>
  );
}

/** Una página del libro, dibujada a partir del modelo (sin lógica de maquetación). */
export function BookPage({ page, format, photosById, placeNames }: BookPageProps) {
  const label =
    page.number === null
      ? page.kind === 'cover'
        ? 'Portada'
        : 'Contraportada'
      : `Página ${String(page.number)}${page.folio ? `: ${page.folio.place}` : ''}`;
  const fullBleed = page.elements.some(
    (el) => el.type === 'photo' && el.box.w >= format.widthMm && el.box.h >= format.heightMm,
  );
  return (
    <article
      className="book-page"
      data-kind={page.kind}
      data-side={page.side}
      data-template={page.templateId}
      data-section={page.sectionId ?? undefined}
      aria-label={label}
      style={{ aspectRatio: `${String(format.widthMm)} / ${String(format.heightMm)}` }}
    >
      {page.elements.map((element) =>
        element.type === 'photo' ? (
          <PhotoSlot
            key={element.id}
            element={element}
            format={format}
            photo={element.photoId ? photosById.get(element.photoId) : undefined}
            alt={(() => {
              const p = element.photoId ? photosById.get(element.photoId) : undefined;
              return p ? photoAlt(p, placeNames) : '';
            })()}
          />
        ) : (
          <TextSlot key={element.id} element={element} format={format} />
        ),
      )}
      {page.number !== null && page.folio && (
        <footer
          className="book-folio"
          data-on-photo={fullBleed}
          style={{ fontSize: fontSize(2.3, format) }}
        >
          <span className="book-folio__number">{page.number}</span>
          <span className="book-folio__text">
            {page.folio.place}
            {page.folio.date ? ` · ${page.folio.date}` : ''}
          </span>
        </footer>
      )}
    </article>
  );
}
