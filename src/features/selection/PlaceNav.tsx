import type { SelectionData } from '../../../shared/api.ts';
import { countSelected, type SelectionMap } from './logic.ts';

interface PlaceNavProps {
  sections: SelectionData['sections'];
  places: SelectionData['places'];
  selection: SelectionMap;
  max: number;
  activePlaceId: string;
  onSelect: (placeId: string) => void;
}

/** Lista de lugares agrupada por sección, con el avance de cada uno (p. ej. 7/10). */
export function PlaceNav({
  sections,
  places,
  selection,
  max,
  activePlaceId,
  onSelect,
}: PlaceNavProps) {
  return (
    <nav className="place-nav" aria-label="Lugares del álbum">
      {sections.map((section) => {
        const sectionPlaces = places.filter((p) => p.section === section.id);
        if (sectionPlaces.length === 0) return null;
        return (
          <div key={section.id} className="place-nav__section" data-section={section.id}>
            <h2 className="place-nav__title">{section.title}</h2>
            <ol className="place-nav__list">
              {sectionPlaces.map((place) => {
                const count = countSelected(selection, place.id);
                const complete = count === max;
                const active = place.id === activePlaceId;
                return (
                  <li key={place.id}>
                    <button
                      type="button"
                      className="place-nav__item"
                      aria-current={active ? 'true' : undefined}
                      data-complete={complete}
                      onClick={() => {
                        onSelect(place.id);
                      }}
                    >
                      <span className="place-nav__name">{place.name}</span>{' '}
                      <span className="place-nav__count">{`${String(count)}/${String(max)}`}</span>
                      {complete && <span className="visually-hidden">, completo</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </nav>
  );
}
