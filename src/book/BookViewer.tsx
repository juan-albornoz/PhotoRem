import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type { SelectionData, SelectionPhoto } from '../../shared/api.ts';
import type { Book, Page, PhotoElement } from '../../shared/book.ts';
import { BookPage, type PageEditing } from './BookPage.tsx';
import { ChevronLeft, ChevronRight, Collapse, Expand, SoundOff, SoundOn } from './icons.tsx';
import {
  createPageTurnSound,
  readSoundPreference,
  writeSoundPreference,
  type PageTurnSound,
} from './pageTurnSound.ts';
import { useMediaQuery } from './useMediaQuery.ts';
import { buildViews, describeView, viewIndexOf, viewPages } from './views.ts';

export type PdfQuality = 'print' | 'light';

export interface BookEditing {
  /** La página tiene un orden propio guardado. */
  isCustom: (page: Page) => boolean;
  /** Intercambia dos fotos de la misma página. */
  onSwap: (page: Page, a: string, b: string) => void;
  /** Vuelve al orden automático (cronológico) de la página. */
  onReset: (page: Page) => void;
}

interface BookViewerProps {
  book: Book;
  photosById: ReadonlyMap<string, SelectionPhoto>;
  places: SelectionData['places'];
  editing?: BookEditing;
  onExportPdf?: (quality: PdfQuality) => void;
  exporting?: boolean;
  /** Mensaje para lectores de pantalla y para la barra (guardado, PDF…). */
  status?: string;
  /** Inyectable para las pruebas (por defecto, el sonido sintetizado con Web Audio). */
  sound?: PageTurnSound;
}

/** Almacenamiento del navegador, si está disponible (no lo está en algunos modos privados). */
const browserStorage = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

/** Páginas en las que se puede reordenar: contenido con más de una foto. */
const reorderable = (page: Page): boolean =>
  page.kind === 'content' && page.elements.filter((e) => e.type === 'photo').length > 1;

/**
 * Modo lectura: doble página en pantallas anchas, página suelta en móvil. Flechas a los lados del
 * libro y en el teclado (← →, Inicio, Fin), salto a cada capítulo, pantalla completa, reordenar las
 * fotos de una página, descarga en PDF y sonido de hoja al pasar página (con botón para silenciarlo).
 */
export function BookViewer({
  book,
  photosById,
  places,
  editing,
  onExportPdf,
  exporting = false,
  status = '',
  sound,
}: BookViewerProps) {
  const wide = useMediaQuery('(min-width: 64rem)');
  const views = useMemo(() => buildViews(book, wide ? 'spread' : 'single'), [book, wide]);
  // Se recuerda la página (no el índice) para no perder el sitio al girar el móvil o cambiar el ancho.
  const [pageId, setPageId] = useState(book.cover.id);
  const index = viewIndexOf(views, pageId);
  const view = views[index] ?? views[0];
  const placeNames = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);
  // Solo el libro (con sus flechas) pasa a pantalla completa, no toda la página.
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [picked, setPicked] = useState<{ pageId: string; elementId: string } | null>(null);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  // Sonido de paso de página: tu preferencia se guarda en el navegador; el motor se crea una vez.
  const [soundOn, setSoundOn] = useState(() => readSoundPreference(browserStorage()));
  const [engine] = useState<PageTurnSound>(() => {
    const created = sound ?? createPageTurnSound(soundOn);
    created.setEnabled(soundOn);
    return created;
  });

  /** Cambia de vista y suena la hoja (solo si de verdad cambia: nunca al abrir el libro). */
  const turnTo = (target: number, riffle = false): void => {
    const clamped = Math.max(0, Math.min(views.length - 1, target));
    const next = views[clamped];
    const first = next ? viewPages(next)[0] : undefined;
    if (!first || clamped === index) return;
    engine.play(clamped > index ? 'next' : 'prev', { riffle });
    setPageId(first.id);
    setPicked(null);
  };
  const goTo = (target: number): void => {
    turnTo(target);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'Escape') {
        setPicked(null);
        return;
      }
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
      const clamped = Math.max(0, Math.min(views.length - 1, next));
      const view = views[clamped];
      const first = view ? viewPages(view)[0] : undefined;
      if (first && clamped !== index) {
        // Inicio/Fin saltan muchas páginas: suena como hojear varias.
        engine.play(clamped > index ? 'next' : 'prev', { riffle: Math.abs(clamped - index) > 1 });
        setPageId(first.id);
        setPicked(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [index, views, engine]);

  useEffect(() => {
    const onChange = (): void => {
      setFullscreen(document.fullscreenElement === stageRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

  // Precarga de las vistas contiguas para que pasar página sea fluido.
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
  const visiblePages = viewPages(view);
  const customPages = editing ? visiblePages.filter((p) => editing.isCustom(p)) : [];

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stageRef.current?.requestFullscreen();
    }
  };

  const pageEditing = (page: Page): PageEditing | undefined => {
    if (!editing || !reordering || !reorderable(page)) return undefined;
    return {
      selectedElementId: picked?.pageId === page.id ? picked.elementId : null,
      onSelect: (element: PhotoElement) => {
        if (picked?.pageId === page.id && picked.elementId === element.id) {
          setPicked(null);
        } else if (picked?.pageId === page.id) {
          editing.onSwap(page, picked.elementId, element.id);
          setPicked(null);
        } else {
          setPicked({ pageId: page.id, elementId: element.id });
        }
      },
      onDropOn: (from: string, to: PhotoElement) => {
        if (page.elements.some((e) => e.id === from)) editing.onSwap(page, from, to.id);
        setPicked(null);
      },
    };
  };

  const spreadStyle = {
    '--page-ratio': String(book.format.widthMm / book.format.heightMm),
  } as CSSProperties;

  return (
    <section className="book-viewer" aria-label="Libro">
      <div className="book-toolbar">
        <p className="book-toolbar__where" aria-live="polite">
          {describeView(view, book.pages.length)}
        </p>
        <label className="book-toolbar__jump">
          <span>Ir a</span>
          <select
            value={currentChapter}
            onChange={(event) => {
              // Saltar a un capítulo suena como hojear varias páginas seguidas.
              turnTo(viewIndexOf(views, event.target.value), true);
            }}
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="book-toolbar__actions">
          {editing && (
            <button
              type="button"
              className="button"
              aria-pressed={reordering}
              onClick={() => {
                setReordering((r) => !r);
                setPicked(null);
              }}
            >
              {reordering ? '✓ Reordenando' : 'Reordenar fotos'}
            </button>
          )}
          {onExportPdf && (
            <details className="book-pdf">
              <summary className="button">{exporting ? 'Generando PDF…' : 'Descargar PDF'}</summary>
              <div className="book-pdf__menu">
                <button
                  type="button"
                  className="button"
                  disabled={exporting}
                  onClick={() => {
                    onExportPdf('light');
                  }}
                >
                  Ligero, para ver y compartir (150 ppp)
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={exporting}
                  onClick={() => {
                    onExportPdf('print');
                  }}
                >
                  Calidad de imprenta (300 ppp)
                </button>
                <p className="book-pdf__note">
                  Incluye portada y contraportada. La primera vez puede tardar unos minutos.
                </p>
              </div>
            </details>
          )}
        </div>
      </div>

      <p className="book-status" role="status" aria-live="polite">
        {status}
      </p>

      {editing && reordering && (
        <div className="book-reorder-help">
          <p>
            Arrastra una foto sobre otra de la misma página para intercambiarlas, o pulsa una y
            después la otra. Escape cancela.
          </p>
          {customPages.map((page) => (
            <button
              key={page.id}
              type="button"
              className="button"
              onClick={() => {
                editing.onReset(page);
                setPicked(null);
              }}
            >
              Volver al orden original de la página {page.number}
            </button>
          ))}
        </div>
      )}

      <div className="book-stage" ref={stageRef} data-fullscreen={fullscreen || undefined}>
        <button
          type="button"
          className="book-icon-button book-sound"
          aria-pressed={soundOn}
          aria-label="Sonido al pasar página"
          title={
            soundOn ? 'Silenciar el sonido de las páginas' : 'Activar el sonido de las páginas'
          }
          onClick={() => {
            const next = !soundOn;
            engine.setEnabled(next);
            setSoundOn(next);
            writeSoundPreference(browserStorage(), next);
            // Al activarlo, una hoja de muestra para que sepas cómo suena.
            if (next) engine.play('next');
          }}
        >
          {soundOn ? <SoundOn /> : <SoundOff />}
        </button>
        {canFullscreen && (
          <button
            type="button"
            className="book-icon-button book-fullscreen"
            aria-pressed={fullscreen}
            aria-label={
              fullscreen ? 'Salir de pantalla completa' : 'Ver el libro a pantalla completa'
            }
            title={fullscreen ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Collapse /> : <Expand />}
          </button>
        )}
        <button
          type="button"
          className="book-icon-button book-arrow book-arrow--prev"
          onClick={() => {
            goTo(index - 1);
          }}
          disabled={index === 0}
          aria-label="Página anterior"
          title="Página anterior (←)"
        >
          <ChevronLeft />
        </button>

        <div
          className="book-spread"
          data-mode={wide ? 'spread' : 'single'}
          data-alone={alone || undefined}
          style={spreadStyle}
        >
          {(wide && !alone ? [view.left, view.right] : visiblePages).map((page, i) =>
            page ? (
              <BookPage
                key={page.id}
                page={page}
                format={book.format}
                photosById={photosById}
                placeNames={placeNames}
                imageMode={{ kind: 'screen', pageVw: wide && !alone ? 50 : 100 }}
                editing={pageEditing(page)}
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

        <button
          type="button"
          className="book-icon-button book-arrow book-arrow--next"
          onClick={() => {
            goTo(index + 1);
          }}
          disabled={index === views.length - 1}
          aria-label="Página siguiente"
          title="Página siguiente (→)"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
}
