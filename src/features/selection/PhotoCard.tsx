import type { SelectionPhoto } from '../../../shared/api.ts';
import { formatLocalTime, thumbSize } from './logic.ts';

interface PhotoCardProps {
  photo: SelectionPhoto;
  description: string;
  selected: boolean;
  suggested: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

export function PhotoCard({
  photo,
  description,
  selected,
  suggested,
  onToggle,
  onOpen,
}: PhotoCardProps) {
  const { day, time } = formatLocalTime(photo.localTime);
  const size = thumbSize(photo);
  return (
    <li className="photo-card" data-selected={selected} data-orientation={photo.orientation}>
      <button
        type="button"
        className="photo-card__open"
        aria-label={`Ampliar: ${description}`}
        onClick={onOpen}
      >
        <img
          src={photo.thumb}
          alt=""
          width={size.width}
          height={size.height}
          loading="lazy"
          decoding="async"
        />
      </button>
      <div className="photo-card__meta">
        <label className="photo-card__pick">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Elegir: ${description}`}
          />
          <span aria-hidden="true">Elegir</span>
        </label>
        <span className="photo-card__time">
          {day} · {time}
        </span>
        <span className="photo-card__tags">
          {suggested && <span className="tag tag--suggested">Sugerida</span>}
          <span className="tag">{photo.source === 'canon' ? 'Canon' : 'iPhone'}</span>
        </span>
      </div>
    </li>
  );
}
