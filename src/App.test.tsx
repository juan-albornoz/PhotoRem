import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.tsx';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('muestra el título del álbum', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'De Burgos a Muxía' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Comprobando el servidor local…');
  });

  it('indica que el servidor local está conectado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse({ status: 'ok', service: 'album-camino', version: '0.1.0' })),
      ),
    );
    render(<App />);

    expect(await screen.findByText('Servidor local conectado (v0.1.0)')).toBeInTheDocument();
  });

  it('indica que el servidor local no responde', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    render(<App />);

    expect(await screen.findByText('Servidor local sin conexión')).toBeInTheDocument();
  });

  it('rechaza una respuesta con un formato inesperado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ status: 'ok' }))),
    );
    render(<App />);

    expect(await screen.findByText('Servidor local sin conexión')).toBeInTheDocument();
  });
});
