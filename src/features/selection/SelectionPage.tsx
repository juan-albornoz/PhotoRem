import { useEffect, useMemo, useState } from 'react';

import type { SelectionData } from '../../../shared/api.ts';
import type { Selection } from '../../../shared/manifest.ts';
import { fetchSelectionData, saveSelection } from '../../services/api.ts';
import { Lightbox } from './Lightbox.tsx';
import { PhotoCard } from './PhotoCard.tsx';
import { PlaceNav } from './PlaceNav.tsx';
import { completedPlaces, countSelected, dayRange, describePhoto } from './logic.ts';
import { useSelection, type SaveStatus } from './useSelection.ts';
import './selection.css';

type LoadState =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: SelectionData };

interface SelectionPageProps {
  /** Inyectables para las pruebas. */
  load?: (signal: AbortSignal) => Promise<SelectionData>;
  save?: (selection: Selection) => Promise<Selection>;
  saveDelayMs?: number;
}

export function SelectionPage({
  load = fetchSelectionData,
  save = saveSelection,
  saveDelayMs,
}: SelectionPageProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        setState({ kind: 'ready', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'No se pudieron cargar las fotos',
        });
      });
    return () => {
      controller.abort();
    };
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <p className="selection__message" role="status">
        Cargando tus fotos…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="selection__message selection__message--error" role="alert">
        <p>No se pudieron cargar las fotos.</p>
        <p>{state.message}</p>
      </div>
    );
  }
  return <SelectionWorkspace data={state.data} save={save} saveDelayMs={saveDelayMs} />;
}

function describeSave(status: SaveStatus): string {
  switch (status.kind) {
    case 'saved':
      return 'Cambios guardados';
    case 'pending':
    case 'saving':
      return 'Guardando…';
    case 'error':
      return `No se pudo guardar: ${status.message}`;
  }
}

function SelectionWorkspace({
  data,
  save,
  saveDelayMs,
}: {
  data: SelectionData;
  save: (selection: Selection) => Promise<Selection>;
  saveDelayMs: number | undefined;
}) {
  const max = data.selectedPerPlace;
  const order = useMemo(() => {
    const sorted = [...data.photos].sort((a, b) => a.localTime.localeCompare(b.localTime));
    return new Map(sorted.map((p, i) => [p.id, i]));
  }, [data.photos]);

  const {
    places: selection,
    status,
    toggle,
    setPlace,
  } = useSelection(data.selection, save, {
    max,
    order,
    ...(saveDelayMs === undefined ? {} : { delayMs: saveDelayMs }),
  });

  const [activePlaceId, setActivePlaceId] = useState(data.places[0]?.id ?? '');
  const [view, setView] = useState<'candidates' | 'all'>('candidates');
  const [camera, setCamera] = useState<'all' | 'canon' | 'iphone'>('all');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  const place = data.places.find((p) => p.id === activePlaceId);
  const entry = data.candidates.find((c) => c.placeId === activePlaceId);
  const allPhotos = useMemo(
    () =>
      data.photos
        .filter((p) => p.placeId === activePlaceId)
        .sort((a, b) => a.localTime.localeCompare(b.localTime)),
    [data.photos, activePlaceId],
  );
  const selectedHere = useMemo(() => selection[activePlaceId] ?? [], [selection, activePlaceId]);
  const inView = useMemo(() => {
    if (view === 'all') return allPhotos;
    // Preselección + lo que hayas elegido desde «Todas», en orden cronológico.
    const ids = new Set([...(entry?.candidates ?? []), ...selectedHere]);
    return allPhotos.filter((p) => ids.has(p.id));
  }, [view, allPhotos, entry, selectedHere]);
  const visible = useMemo(
    () => (camera === 'all' ? inView : inView.filter((p) => p.source === camera)),
    [camera, inView],
  );
  const canonTotal = allPhotos.filter((p) => p.source === 'canon').length;
  const iphoneTotal = allPhotos.length - canonTotal;
  const canonInView = inView.filter((p) => p.source === 'canon').length;
  const suggested = new Set(entry?.suggested ?? []);

  if (!place) return null;

  const count = countSelected(selection, place.id);
  const complete = completedPlaces(
    selection,
    data.places.map((p) => p.id),
    max,
  );

  const handleToggle = (photoId: string): void => {
    const result = toggle(place.id, photoId);
    if (result === 'limit') {
      setNotice(`Ya tienes ${String(max)} fotos en ${place.name}. Quita una para añadir otra.`);
    } else {
      setNotice('');
    }
  };

  const selectPlace = (placeId: string): void => {
    setActivePlaceId(placeId);
    setView('candidates');
    setCamera('all');
    setNotice('');
    setOpenIndex(null);
  };

  const open = openIndex === null ? undefined : visible[openIndex];

  return (
    <div className="selection">
      <header className="selection__header">
        <h1>Elige tus fotos</h1>
        <p className="selection__lede">
          {max} por lugar. Las marcadas como <span className="tag tag--suggested">Sugerida</span>{' '}
          son mi propuesta: puedes cambiar cualquiera.
        </p>
        <div className="selection__summary">
          <p>
            Lugares completos: <strong>{complete}</strong> de {data.places.length}
          </p>
          <p className="selection__save" data-state={status.kind} role="status" aria-live="polite">
            {describeSave(status)}
          </p>
        </div>
      </header>

      <div className="selection__layout">
        <PlaceNav
          sections={data.sections}
          places={data.places}
          selection={selection}
          max={max}
          activePlaceId={place.id}
          onSelect={selectPlace}
        />

        <section className="selection__place" aria-labelledby="place-title">
          <div className="selection__place-header">
            <div>
              <h2 id="place-title">{place.name}</h2>
              <p className="selection__place-meta">
                {dayRange(allPhotos)} · {allPhotos.length} fotos ({canonTotal} Canon · {iphoneTotal}{' '}
                iPhone) · <strong>{count}</strong> de {max} elegidas
              </p>
            </div>
            <div className="selection__tools">
              <div className="segmented" role="group" aria-label="Qué fotos ver">
                <button
                  type="button"
                  aria-pressed={view === 'candidates'}
                  onClick={() => {
                    setView('candidates');
                  }}
                >
                  Preselección ({entry?.candidates.length ?? 0})
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'all'}
                  onClick={() => {
                    setView('all');
                  }}
                >
                  Todas ({allPhotos.length})
                </button>
              </div>
              {canonTotal > 0 && iphoneTotal > 0 && (
                <div className="segmented" role="group" aria-label="Cámara">
                  {(
                    [
                      ['all', 'Las dos', inView.length],
                      ['canon', 'Canon', canonInView],
                      ['iphone', 'iPhone', inView.length - canonInView],
                    ] as const
                  ).map(([value, label, n]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={camera === value}
                      onClick={() => {
                        setCamera(value);
                        setOpenIndex(null);
                      }}
                    >
                      {label} ({n})
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="button"
                onClick={() => {
                  setPlace(place.id, entry?.suggested ?? []);
                  setNotice(`Se restableció la sugerencia de ${place.name}.`);
                }}
              >
                Restablecer sugerencia
              </button>
            </div>
          </div>

          <p className="selection__notice" role="status" aria-live="polite">
            {notice}
          </p>

          <ul className="photo-grid" aria-label={`Fotos de ${place.name}`}>
            {visible.map((photo, index) => {
              const description = describePhoto(photo, place.name, index + 1);
              return (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  description={description}
                  selected={selectedHere.includes(photo.id)}
                  suggested={suggested.has(photo.id)}
                  onToggle={() => {
                    handleToggle(photo.id);
                  }}
                  onOpen={() => {
                    setOpenIndex(index);
                  }}
                />
              );
            })}
          </ul>
        </section>
      </div>

      {open && openIndex !== null && (
        <Lightbox
          photo={open}
          description={describePhoto(open, place.name, openIndex + 1)}
          position={openIndex + 1}
          total={visible.length}
          selected={selectedHere.includes(open.id)}
          onToggle={() => {
            handleToggle(open.id);
          }}
          onPrevious={() => {
            setOpenIndex((i) => (i === null ? i : Math.max(0, i - 1)));
          }}
          onNext={() => {
            setOpenIndex((i) => (i === null ? i : Math.min(visible.length - 1, i + 1)));
          }}
          onClose={() => {
            setOpenIndex(null);
          }}
        />
      )}
    </div>
  );
}
