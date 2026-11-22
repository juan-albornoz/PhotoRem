import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.tsx';
import { bookConfigFixture, bookDataFixture } from './test/fixtures.ts';
import { parseRoute } from './useHashRoute.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Simula el servidor local: salud, datos de las fotos y textos del libro. */
function stubServer(health: () => Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/health')) return health();
      if (url.endsWith('/api/selection-data'))
        return Promise.resolve(jsonResponse(bookDataFixture()));
      if (url.endsWith('/api/book-config'))
        return Promise.resolve(jsonResponse(bookConfigFixture()));
      return Promise.resolve(jsonResponse({ error: 'no encontrado' }, 404));
    }),
  );
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  it('abre el libro por defecto, con pestañas y enlace para saltar al contenido', async () => {
    stubServer(() => new Promise<Response>(() => undefined));
    render(<App />);

    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute(
      'href',
      '#contenido',
    );
    expect(screen.getByRole('link', { name: 'Libro' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('article', { name: 'Portada' })).toBeInTheDocument();
    expect(screen.getByText('Comprobando el servidor local…')).toBeInTheDocument();
  });

  it('cambia a la selección de fotos con la pestaña', async () => {
    stubServer(() => new Promise<Response>(() => undefined));
    render(<App />);
    await act(async () => {
      window.location.hash = '#/seleccion';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Elige tus fotos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Selección de fotos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('interpreta la dirección: #/seleccion o, si no, el libro', () => {
    expect(parseRoute('#/seleccion')).toBe('seleccion');
    expect(parseRoute('#seleccion')).toBe('seleccion');
    expect(parseRoute('')).toBe('libro');
    expect(parseRoute('#/otra')).toBe('libro');
  });

  it('indica que el servidor local está conectado', async () => {
    stubServer(() =>
      Promise.resolve(jsonResponse({ status: 'ok', service: 'album-camino', version: '0.3.0' })),
    );
    render(<App />);
    expect(await screen.findByText('Servidor local conectado (v0.3.0)')).toBeInTheDocument();
  });

  it('indica que el servidor local no responde', async () => {
    stubServer(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<App />);
    expect(await screen.findByText('Servidor local sin conexión')).toBeInTheDocument();
  });

  it('rechaza una respuesta de salud con un formato inesperado', async () => {
    stubServer(() => Promise.resolve(jsonResponse({ status: 'ok' })));
    render(<App />);
    expect(await screen.findByText('Servidor local sin conexión')).toBeInTheDocument();
  });
});
