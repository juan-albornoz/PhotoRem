import { useEffect, useRef } from 'react';

import type { SelectionPhoto } from '../../../shared/api.ts';

interface LightboxProps {
  photo: SelectionPhoto;
  description: string;
  position: number;
  total: number;
  selected: boolean;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * Vista ampliada en un `<dialog>` modal nativo: atrapa el foco, se cierra con Escape y
 * devuelve el foco al elemento que la abrió. Flechas ← → para pasar de foto.
 */
export function Lightbox({
  photo,
  description,
  position,
  total,
  selected,
  onToggle,
  onPrevious,
  onNext,
  onClose,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Flechas ← → solo mientras el foco está dentro del diálogo.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevious();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
    };
  }, [onPrevious, onNext]);

  return (
    <dialog ref={dialogRef} className="lightbox" aria-label={description} onClose={onClose}>
      <div className="lightbox__frame">
        <img key={photo.id} className="lightbox__image" src={photo.preview} alt={description} />
      </div>
      <div className="lightbox__bar">
        <button type="button" className="button" onClick={onPrevious} disabled={position <= 1}>
          ← Anterior
        </button>
        <p className="lightbox__caption">
          {description} · {position} de {total}
        </p>
        <button
          type="button"
          className="button button--primary"
          aria-pressed={selected}
          onClick={onToggle}
        >
          {selected ? '✓ Elegida' : 'Elegir'}
        </button>
        <button type="button" className="button" onClick={onNext} disabled={position >= total}>
          Siguiente →
        </button>
        <button
          type="button"
          className="button lightbox__close"
          onClick={() => {
            dialogRef.current?.close();
          }}
        >
          Cerrar
        </button>
      </div>
    </dialog>
  );
}
