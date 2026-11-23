import { useEffect, useMemo, useRef, useState } from 'react';

import type { SelectionData } from '../../shared/api.ts';
import type { BookConfig, LayoutOverrides } from '../../shared/book.ts';
import { fetchBookConfig, fetchLayout, fetchSelectionData } from '../services/api.ts';
import { BookPage } from './BookPage.tsx';
import { generateBook } from './layout/generate.ts';
import './book.css';

interface Loaded {
  data: SelectionData;
  config: BookConfig;
  layout: LayoutOverrides;
}

/**
 * Página de impresión: todas las páginas seguidas a tamaño real (mm), sin la interfaz de la app.
 * El servidor la abre con Chromium para generar el PDF. Cuando todas las fotos han cargado, marca el
 * `<body>` con `data-print-ready` (y `data-print-errors`, cuántas fallaron).
 */
export function PrintScreen({ quality }: { quality: 'print' | 'light' }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const dpi = quality === 'print' ? 300 : 150;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchSelectionData(controller.signal),
      fetchBookConfig(controller.signal),
      fetchLayout(controller.signal),
    ])
      .then(([data, config, layout]) => {
        setLoaded({ data, config, layout });
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      controller.abort();
    };
  }, []);

  const book = useMemo(
    () =>
      loaded
        ? generateBook({
            config: loaded.config,
            data: { ...loaded.data, selection: loaded.data.selection.places },
            overrides: loaded.layout.pages,
          })
        : null,
    [loaded],
  );
  const photosById = useMemo(
    () => new Map((loaded?.data.photos ?? []).map((p) => [p.id, p])),
    [loaded],
  );
  const placeNames = useMemo(
    () => new Map((loaded?.data.places ?? []).map((p) => [p.id, p.name])),
    [loaded],
  );

  useEffect(() => {
    if (!book || !container.current) return;
    let cancelled = false;
    const images = Array.from(container.current.querySelectorAll('img'));
    const settled = images.map(
      (img) =>
        new Promise<boolean>((resolve) => {
          if (img.complete) {
            resolve(img.naturalWidth > 0);
            return;
          }
          img.addEventListener('load', () => {
            resolve(true);
          });
          img.addEventListener('error', () => {
            resolve(false);
          });
        }),
    );
    void Promise.all(settled).then(async (results) => {
      // Descargada no basta: se espera a que cada foto esté decodificada, lista para pintarse.
      await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
      await document.fonts.ready;
      if (cancelled) return;
      document.body.dataset.printErrors = String(results.filter((ok) => !ok).length);
      document.body.dataset.printReady = 'true';
    });
    return () => {
      cancelled = true;
    };
  }, [book]);

  if (error) {
    return (
      <p role="alert" className="book-message book-message--error">
        No se pudo preparar el libro para imprimir: {error}
      </p>
    );
  }
  if (!book) return <p className="book-message">Preparando el libro para imprimir…</p>;

  const { widthMm: W, heightMm: H } = book.format;
  return (
    <div className="print-book" ref={container}>
      <style>{`@page { size: ${String(W)}mm ${String(H)}mm; margin: 0; }`}</style>
      <h1 className="visually-hidden">
        {book.meta.title} · {book.meta.subtitle}
      </h1>
      {[book.cover, ...book.pages, book.back].map((page) => (
        <div
          key={page.id}
          className="print-page"
          style={{ width: `${String(W)}mm`, height: `${String(H)}mm` }}
        >
          <BookPage
            page={page}
            format={book.format}
            photosById={photosById}
            placeNames={placeNames}
            imageMode={{ kind: 'print', dpi }}
          />
        </div>
      ))}
    </div>
  );
}
