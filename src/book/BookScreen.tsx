import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SelectionData } from '../../shared/api.ts';
import {
  pageSignature,
  type BookConfig,
  type LayoutOverrides,
  type Page,
  type PageOrder,
} from '../../shared/book.ts';
import {
  exportBookPdf,
  fetchBookConfig,
  fetchLayout,
  fetchSelectionData,
  saveLayout,
} from '../services/api.ts';
import { BookViewer, type BookEditing, type PdfQuality } from './BookViewer.tsx';
import { generateBook } from './layout/generate.ts';
import './book.css';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: SelectionData; config: BookConfig };

interface BookScreenProps {
  /** Inyectables para las pruebas. */
  loadData?: (signal: AbortSignal) => Promise<SelectionData>;
  loadConfig?: (signal: AbortSignal) => Promise<BookConfig>;
  loadLayout?: (signal: AbortSignal) => Promise<LayoutOverrides>;
  persistLayout?: (layout: LayoutOverrides) => Promise<LayoutOverrides>;
  exportPdf?: (quality: PdfQuality) => Promise<Blob>;
}

/** Fotos de una página en el orden de sus huecos. */
export function pagePhotoIds(page: Page): string[] {
  return page.elements.flatMap((e) => (e.type === 'photo' && e.photoId ? [e.photoId] : []));
}

/** Nuevo orden de una página tras intercambiar los huecos `a` y `b` (ids de elemento). */
export function swappedOrder(page: Page, a: string, b: string): PageOrder | null {
  const slots = page.elements.filter((e) => e.type === 'photo');
  const ia = slots.findIndex((e) => e.id === a);
  const ib = slots.findIndex((e) => e.id === b);
  if (ia < 0 || ib < 0 || ia === ib) return null;
  const order = slots.map((e) => e.photoId);
  [order[ia], order[ib]] = [order[ib] ?? null, order[ia] ?? null];
  if (order.some((id) => id === null)) return null;
  return { templateId: page.templateId, order: order as string[] };
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** Pantalla «Libro»: carga tu selección, los textos y tus órdenes, genera el libro y lo muestra. */
export function BookScreen({
  loadData = fetchSelectionData,
  loadConfig = fetchBookConfig,
  loadLayout = fetchLayout,
  persistLayout = saveLayout,
  exportPdf = exportBookPdf,
}: BookScreenProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [overrides, setOverrides] = useState<Record<string, PageOrder>>({});
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadData(controller.signal),
      loadConfig(controller.signal),
      loadLayout(controller.signal),
    ])
      .then(([data, config, layout]) => {
        setOverrides(layout.pages);
        setState({ kind: 'ready', data, config });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'No se pudo cargar el libro',
        });
      });
    return () => {
      controller.abort();
    };
  }, [loadData, loadConfig, loadLayout]);

  const ready = state.kind === 'ready' ? state : null;
  const book = useMemo(
    () =>
      ready
        ? generateBook({
            config: ready.config,
            data: { ...ready.data, selection: ready.data.selection.places },
            overrides,
          })
        : null,
    [ready, overrides],
  );
  const photosById = useMemo(
    () => new Map((ready?.data.photos ?? []).map((p) => [p.id, p])),
    [ready],
  );

  const persist = useCallback(
    (next: Record<string, PageOrder>, message: string) => {
      setOverrides(next);
      persistLayout({ version: 1, updatedAt: new Date().toISOString(), pages: next })
        .then(() => {
          setStatus(message);
        })
        .catch((error: unknown) => {
          setStatus(
            `No se pudo guardar el orden: ${error instanceof Error ? error.message : 'error desconocido'}`,
          );
        });
    },
    [persistLayout],
  );

  const editing: BookEditing = useMemo(
    () => ({
      isCustom: (page) => pageSignature(pagePhotoIds(page)) in overrides,
      onSwap: (page, a, b) => {
        const order = swappedOrder(page, a, b);
        if (!order) return;
        persist(
          { ...overrides, [pageSignature(order.order)]: order },
          `Fotos intercambiadas en la página ${String(page.number)}. Orden guardado.`,
        );
      },
      onReset: (page) => {
        const signature = pageSignature(pagePhotoIds(page));
        const next = Object.fromEntries(
          Object.entries(overrides).filter(([key]) => key !== signature),
        );
        persist(next, `La página ${String(page.number)} vuelve al orden original.`);
      },
    }),
    [overrides, persist],
  );

  const onExportPdf = (quality: PdfQuality): void => {
    setExporting(true);
    setStatus('Generando el PDF… La primera vez puede tardar unos minutos.');
    exportPdf(quality)
      .then((blob) => {
        download(blob, quality === 'print' ? 'camino-frances-imprenta.pdf' : 'camino-frances.pdf');
        setStatus(`PDF listo (${(blob.size / 1_048_576).toFixed(1)} MB).`);
      })
      .catch((error: unknown) => {
        setStatus(
          `No se pudo generar el PDF: ${error instanceof Error ? error.message : 'error desconocido'}`,
        );
      })
      .finally(() => {
        setExporting(false);
      });
  };

  if (state.kind === 'loading') {
    return (
      <p className="book-message" role="status">
        Preparando el libro…
      </p>
    );
  }
  if (state.kind === 'error' || !book || !ready) {
    return (
      <div className="book-message book-message--error" role="alert">
        <p>No se pudo preparar el libro.</p>
        <p>{state.kind === 'error' ? state.message : ''}</p>
      </div>
    );
  }
  return (
    <div className="book-screen">
      <h1 className="visually-hidden">
        {book.meta.title} · {book.meta.subtitle}
      </h1>
      <BookViewer
        book={book}
        photosById={photosById}
        places={ready.data.places}
        editing={editing}
        onExportPdf={onExportPdf}
        exporting={exporting}
        status={status}
      />
    </div>
  );
}
