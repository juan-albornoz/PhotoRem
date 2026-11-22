import { useEffect, useState } from 'react';

import { fetchHealth } from './services/api.ts';

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

export function App() {
  const [api, setApi] = useState<ApiState>({ kind: 'checking' });

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
    <main className="shell">
      <p className="eyebrow">Camino Francés</p>
      <h1>De Burgos a Muxía</h1>
      <p className="lede">Fotolibro editable · Fase F0: base del proyecto</p>
      <p className="status" data-state={api.kind} role="status" aria-live="polite">
        {describeApi(api)}
      </p>
    </main>
  );
}
