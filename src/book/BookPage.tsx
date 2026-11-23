import type { CSSProperties, DragEvent } from 'react';

import type { SelectionPhoto } from '../../shared/api.ts';
import type { Box, Format, Page, PhotoElement, TextElement } from '../../shared/book.ts';
import { formatLocalTime } from '../features/selection/logic.ts';
import { printSource, screenSource, type ImageMode } from './images.ts';

/** Reordenación de fotos dentro de la página: qué foto está elegida y qué hacer al pulsar o soltar. */
export interface PageEditing {
  selectedElementId: string | null;
  onSelect: (element: PhotoElement) => void;
  onDropOn: (fromElementId: string, toElement: PhotoElement) => void;
}

interface BookPageProps {
  page: Page;
  format: Format;
  photosById: ReadonlyMap<string, SelectionPhoto>;
  placeNames: ReadonlyMap<string, string>;
  imageMode?: ImageMode;
  /** Solo en modo «Reordenar fotos» y en páginas con más de una foto. */
  editing?: PageEditing;
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

export function photoAlt(photo: SelectionPhoto, placeNames: ReadonlyMap<string, string>): string {
  const { day, time } = formatLocalTime(photo.localTime);
  const place = placeNames.get(photo.placeId) ?? '';
  return `${place}, ${day} a las ${time} (${photo.source === 'canon' ? 'Canon' : 'iPhone'})`;
}

const DRAG_TYPE = 'application/x-photorem-element';

function PhotoSlot({
  element,
  format,
  photo,
  alt,
  imageMode,
  editing,
  position: slotNumber,
}: {
  element: PhotoElement;
  format: Format;
  photo: SelectionPhoto | undefined;
  alt: string;
  imageMode: ImageMode;
  editing: PageEditing | undefined;
  position: number;
}) {
  const { crop } = element;
  const source = photo
    ? imageMode.kind === 'print'
      ? printSource(photo, element, imageMode.dpi)
      : screenSource(photo, element, format, imageMode.pageVw)
    : null;
  const selected = editing?.selectedElementId === element.id;
  return (
    <div className="book-photo" style={position(element.box, format)} data-selected={selected}>
      {photo && source ? (
        <img
          src={source.src}
          srcSet={source.srcSet}
          sizes={source.sizes}
          alt={alt}
          loading={imageMode.kind === 'print' ? 'eager' : 'lazy'}
          decoding="async"
          style={{
            objectFit: source.fit,
            objectPosition:
              source.fit === 'cover'
                ? `${String(crop.centerX * 100)}% ${String(crop.centerY * 100)}%`
                : undefined,
            transform:
              source.fit === 'cover' && crop.scale > 1 ? `scale(${String(crop.scale)})` : undefined,
          }}
        />
      ) : (
        <span className="book-photo__missing">Foto no disponible</span>
      )}
      {editing && (
        <button
          type="button"
          className="book-photo__edit"
          aria-pressed={selected}
          aria-label={`Foto ${String(slotNumber)}${alt ? `: ${alt}` : ''}. ${
            selected
              ? 'Elegida: pulsa otra foto de la página para intercambiarlas.'
              : 'Pulsa para moverla.'
          }`}
          draggable
          onClick={() => {
            editing.onSelect(element);
          }}
          onDragStart={(event: DragEvent) => {
            event.dataTransfer.setData(DRAG_TYPE, element.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(event: DragEvent) => {
            if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault();
          }}
          onDrop={(event: DragEvent) => {
            event.preventDefault();
            const from = event.dataTransfer.getData(DRAG_TYPE);
            if (from && from !== element.id) editing.onDropOn(from, element);
          }}
        />
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
export function BookPage({
  page,
  format,
  photosById,
  placeNames,
  imageMode = { kind: 'screen', pageVw: 50 },
  editing,
}: BookPageProps) {
  const label =
    page.number === null
      ? page.kind === 'cover'
        ? 'Portada'
        : 'Contraportada'
      : `Página ${String(page.number)}${page.folio ? `: ${page.folio.place}` : ''}`;
  const fullBleed = page.elements.some(
    (el) => el.type === 'photo' && el.box.w >= format.widthMm && el.box.h >= format.heightMm,
  );
  // Número de cada foto en la página (1, 2, 3…), para su nombre accesible.
  const photoNumbers = new Map(
    page.elements.filter((e) => e.type === 'photo').map((e, i) => [e.id, i + 1]),
  );
  return (
    <article
      className="book-page"
      data-kind={page.kind}
      data-side={page.side}
      data-template={page.templateId}
      data-section={page.sectionId ?? undefined}
      data-editing={editing ? true : undefined}
      aria-label={label}
      style={{ aspectRatio: `${String(format.widthMm)} / ${String(format.heightMm)}` }}
    >
      {page.elements.map((element) => {
        if (element.type === 'text') {
          return <TextSlot key={element.id} element={element} format={format} />;
        }
        const photo = element.photoId ? photosById.get(element.photoId) : undefined;
        return (
          <PhotoSlot
            key={element.id}
            element={element}
            format={format}
            photo={photo}
            alt={photo ? photoAlt(photo, placeNames) : ''}
            imageMode={imageMode}
            editing={editing}
            position={photoNumbers.get(element.id) ?? 0}
          />
        );
      })}
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
