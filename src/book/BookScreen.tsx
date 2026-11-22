import { useEffect, useMemo, useState } from 'react';

import type { SelectionData } from '../../shared/api.ts';
import type { BookConfig } from '../../shared/book.ts';
import { fetchBookConfig, fetchSelectionData } from '../services/api.ts';
import { BookViewer } from './BookViewer.tsx';
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
}

/** Pantalla «Libro»: carga tu selección y los textos, genera el libro y lo muestra en modo lectura. */
export function BookScreen({
  loadData = fetchSelectionData,
  loadConfig = fetchBookConfig,
}: BookScreenProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([loadData(controller.signal), loadConfig(controller.signal)])
      .then(([data, config]) => {
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
  }, [loadData, loadConfig]);

  const ready = state.kind === 'ready' ? state : null;
  const book = useMemo(
    () =>
      ready
        ? generateBook({
            config: ready.config,
            data: { ...ready.data, selection: ready.data.selection.places },
          })
        : null,
    [ready],
  );
  const photosById = useMemo(
    () => new Map((ready?.data.photos ?? []).map((p) => [p.id, p])),
    [ready],
  );

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
      <BookViewer book={book} photosById={photosById} places={ready.data.places} />
    </div>
  );
}
