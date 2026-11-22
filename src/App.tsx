import { useEffect, useState } from 'react';

import { BookScreen } from './book/BookScreen.tsx';
import { SelectionPage } from './features/selection/SelectionPage.tsx';
import { fetchHealth } from './services/api.ts';
import { useHashRoute, type Route } from './useHashRoute.ts';

type ApiState = { kind: 'checking' } | { kind: 'online'; version: string } | { kind: 'offline' };

function describeApi(state: ApiState): string {
  switch (state.kind) {
    case 'checking':
      return 'Comprobando el servidor local…';
    case 'online':
      return `Servidor local conectado (v${state.version})`;
    case 'offline':
      return 'Servidor local sin conexión';
  }
}

const TABS: readonly { route: Route; label: string }[] = [
  { route: 'libro', label: 'Libro' },
  { route: 'seleccion', label: 'Selección de fotos' },
];

export function App() {
  const [api, setApi] = useState<ApiState>({ kind: 'checking' });
  const route = useHashRoute();

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => {
        setApi({ kind: 'online', version: health.version });
      })
      .catch(() => {
        if (!controller.signal.aborted) setApi({ kind: 'offline' });
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="app-header">
        <div>
          <p className="eyebrow">Camino Francés</p>
          <p className="app-header__title">De Burgos a Muxía</p>
        </div>
        <nav className="app-tabs" aria-label="Secciones de la app">
          {TABS.map((tab) => (
            <a
              key={tab.route}
              href={`#/${tab.route}`}
              className="app-tabs__link"
              aria-current={route === tab.route ? 'page' : undefined}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="contenido" tabIndex={-1}>
        {route === 'libro' ? <BookScreen /> : <SelectionPage />}
      </main>
      <footer className="app-footer">
        <p className="status" data-state={api.kind} role="status" aria-live="polite">
          {describeApi(api)}
        </p>
      </footer>
    </>
  );
}
