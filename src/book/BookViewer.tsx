import { useEffect, useMemo, useState } from 'react';

import type { SelectionData, SelectionPhoto } from '../../shared/api.ts';
import type { Book } from '../../shared/book.ts';
import { BookPage } from './BookPage.tsx';
import { useMediaQuery } from './useMediaQuery.ts';
import { buildViews, describeView, viewIndexOf, viewPages } from './views.ts';

interface BookViewerProps {
  book: Book;
  photosById: ReadonlyMap<string, SelectionPhoto>;
  places: SelectionData['places'];
}

/**
 * Modo lectura: doble página en pantallas anchas, página suelta en móvil. Flechas en pantalla y del
 * teclado (← →, Inicio, Fin) y salto directo a cada capítulo. El paso de página animado llega en la F3.
 */
export function BookViewer({ book, photosById, places }: BookViewerProps) {
  const wide = useMediaQuery('(min-width: 64rem)');
  const views = useMemo(() => buildViews(book, wide ? 'spread' : 'single'), [book, wide]);
  // Se recuerda la página (no el índice) para no perder el sitio al girar el móvil o cambiar el ancho.
  const [pageId, setPageId] = useState(book.cover.id);
  const index = viewIndexOf(views, pageId);
  const view = views[index] ?? views[0];
  const placeNames = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);

  const goTo = (target: number): void => {
    const next = views[Math.max(0, Math.min(views.length - 1, target))];
    const first = next ? viewPages(next)[0] : undefined;
    if (first) setPageId(first.id);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const keys: Record<string, number> = {
        ArrowLeft: index - 1,
        ArrowRight: index + 1,
        PageUp: index - 1,
        PageDown: index + 1,
        Home: 0,
        End: views.length - 1,
      };
      const next = keys[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const view = views[Math.max(0, Math.min(views.length - 1, next))];
      const first = view ? viewPages(view)[0] : undefined;
      if (first) setPageId(first.id);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [index, views]);

  // Precarga de las fotos de las vistas contiguas para que pasar página sea fluido.
  useEffect(() => {
    for (const neighbour of [views[index - 1], views[index + 1]]) {
      if (!neighbour) continue;
      for (const page of viewPages(neighbour)) {
        for (const el of page.elements) {
          const src =
            el.type === 'photo' && el.photoId ? photosById.get(el.photoId)?.preview : undefined;
          if (src) new Image().src = src;
        }
      }
    }
  }, [index, views, photosById]);

  const chapters = useMemo(
    () => [
      { id: book.cover.id, label: 'Portada' },
      ...book.pages
        .filter(
          (p) => p.kind === 'index' || (p.kind === 'opening' && p.templateId === 'opening-text'),
        )
        .map((p) => ({
          id: p.id,
          label:
            p.kind === 'index'
              ? 'Índice'
              : `${placeNames.get(p.placeId ?? '') ?? ''} · pág. ${String(p.number)}`,
        })),
      { id: book.back.id, label: 'Contraportada' },
    ],
    [book, placeNames],
  );

  // Posición de cada página en el libro (portada = 0), para saber en qué capítulo estás.
  const positions = useMemo(
    () => new Map([book.cover, ...book.pages, book.back].map((p, i) => [p.id, i])),
    [book],
  );

  if (!view) return null;
  // La portada y la contraportada se ven solas y centradas, como el libro cerrado.
  const alone = viewPages(view).some((p) => p.kind === 'cover' || p.kind === 'back');
  const currentPosition = positions.get(viewPages(view)[0]?.id ?? '') ?? 0;
  const currentChapter =
    [...chapters].reverse().find((c) => (positions.get(c.id) ?? 0) <= currentPosition)?.id ??
    book.cover.id;

  return (
    <section className="book-viewer" aria-label="Libro">
      <div className="book-toolbar">
        <button
          type="button"
          className="button book-toolbar__nav"
          onClick={() => {
            goTo(index - 1);
          }}
          disabled={index === 0}
          aria-label="Página anterior"
        >
          ←
        </button>
        <p className="book-toolbar__where" aria-live="polite">
          {describeView(view, book.pages.length)}
        </p>
        <label className="book-toolbar__jump">
          <span>Ir a</span>
          <select
            value={currentChapter}
            onChange={(event) => {
              setPageId(event.target.value);
            }}
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button book-toolbar__nav"
          onClick={() => {
            goTo(index + 1);
          }}
          disabled={index === views.length - 1}
          aria-label="Página siguiente"
        >
          →
        </button>
      </div>

      <div className="book-stage">
        <div
          className="book-spread"
          data-mode={wide ? 'spread' : 'single'}
          data-alone={alone || undefined}
        >
          {(wide && !alone ? [view.left, view.right] : viewPages(view)).map((page, i) =>
            page ? (
              <BookPage
                key={page.id}
                page={page}
                format={book.format}
                photosById={photosById}
                placeNames={placeNames}
              />
            ) : (
              <div
                key={`empty-${String(i)}`}
                className="book-page book-page--endpaper"
                aria-hidden="true"
                style={{
                  aspectRatio: `${String(book.format.widthMm)} / ${String(book.format.heightMm)}`,
                }}
              />
            ),
          )}
        </div>
      </div>
    </section>
  );
}
