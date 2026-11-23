import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LayoutOverrides } from '../../shared/book.ts';
import { bookConfigFixture, bookDataFixture } from '../test/fixtures.ts';
import { BookScreen } from './BookScreen.tsx';

const emptyLayout = (): LayoutOverrides => ({ version: 1, updatedAt: '', pages: {} });

/** Como el fixture, pero con las cinco fotos de Burgos elegidas: así hay páginas con varias fotos. */
function richData(): ReturnType<typeof bookDataFixture> {
  const data = bookDataFixture();
  return {
    ...data,
    selection: {
      ...data.selection,
      places: { ...data.selection.places, burgos: ['b1', 'b2', 'b3', 'b4', 'b5'] },
    },
  };
}

function setup(
  options: {
    layout?: LayoutOverrides;
    exportPdf?: (q: 'print' | 'light') => Promise<Blob>;
  } = {},
) {
  const user = userEvent.setup();
  const persistLayout = vi.fn((layout: LayoutOverrides) => Promise.resolve(layout));
  const exportPdf = vi.fn(
    options.exportPdf ??
      (() => Promise.resolve(new Blob(['%PDF-1.7'], { type: 'application/pdf' }))),
  );
  render(
    <BookScreen
      loadData={() => Promise.resolve(richData())}
      loadConfig={() => Promise.resolve(bookConfigFixture())}
      loadLayout={() => Promise.resolve(options.layout ?? emptyLayout())}
      persistLayout={persistLayout}
      exportPdf={exportPdf}
    />,
  );
  return { user, persistLayout, exportPdf };
}

/** Va a la primera página de Burgos con varias fotos (en jsdom se ve una página cada vez). */
async function goToBurgosContent(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const jump = await screen.findByRole('combobox', { name: 'Ir a' });
  await user.selectOptions(jump, within(jump).getByRole('option', { name: /^Burgos/ }));
  const next = screen.getByRole('button', { name: 'Página siguiente' });
  for (let i = 0; i < 6; i += 1) {
    await user.click(next);
    const page = screen.queryByRole('article', { name: /^Página \d+: Burgos/ });
    if (page && within(page).queryAllByRole('img').length >= 2) return page;
  }
  throw new Error('No hay ninguna página de Burgos con varias fotos');
}

describe('BookScreen (modo lectura)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('abre por la portada con el título del libro', async () => {
    setup();
    const cover = await screen.findByRole('article', { name: 'Portada' });
    expect(within(cover).getByText('Camino Francés')).toBeInTheDocument();
    expect(within(cover).getByText('De Burgos a Muxía')).toBeInTheDocument();
    expect(screen.getByText('Portada', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  });

  it('pasa página con los botones laterales y con las flechas del teclado', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByRole('article', { name: /^Página 1/ })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('article', { name: /^Página 2/ })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('article', { name: 'Portada' })).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(screen.getByRole('article', { name: 'Contraportada' })).toBeInTheDocument();
  });

  it('salta directamente a un capítulo y muestra su folio', async () => {
    const { user } = setup();
    const jump = await screen.findByRole('combobox', { name: 'Ir a' });
    await user.selectOptions(jump, within(jump).getByRole('option', { name: /^León/ }));
    const page = screen.getByRole('article', { name: /León$/ });
    expect(within(page).getByText('León', { selector: '.book-text--display' })).toBeInTheDocument();
    expect(within(page).getByText(/León · 14–15 oct 2026/)).toBeInTheDocument();
  });

  it('describe cada foto y pide la resolución adecuada a cada hueco (srcset)', async () => {
    const { user } = setup();
    await goToBurgosContent(user);
    const images = screen.getAllByRole('img');
    expect(images.every((img) => img.getAttribute('alt'))).toBe(true);
    expect(images[0]?.getAttribute('srcset')).toMatch(/\/api\/image\?id=b\d&w=800 \d+w/);
    expect(images[0]?.getAttribute('sizes')).toMatch(/^\d+vw$/);
  });

  it('intercambia dos fotos de una página pulsando una y después la otra, y lo guarda', async () => {
    const { user, persistLayout } = setup();
    const page = await goToBurgosContent(user);
    const before = within(page)
      .getAllByRole('img')
      .map((img) => img.getAttribute('src'));
    await user.click(screen.getByRole('button', { name: 'Reordenar fotos' }));
    await user.click(within(page).getByRole('button', { name: /^Foto 1/ }));
    expect(within(page).getByRole('button', { name: /^Foto 1/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(page).getByRole('button', { name: /^Foto 2/ }));
    await waitFor(() => {
      expect(persistLayout).toHaveBeenCalledTimes(1);
    });
    expect(Object.keys(persistLayout.mock.calls[0]?.[0].pages ?? {})).toHaveLength(1);
    const after = within(screen.getByRole('article', { name: /^Página \d+: Burgos/ }))
      .getAllByRole('img')
      .map((img) => img.getAttribute('src'));
    expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
    expect(
      await screen.findByText(/Fotos intercambiadas en la página \d+\. Orden guardado\./),
    ).toBeInTheDocument();
  });

  it('vuelve al orden original de una página', async () => {
    const { user, persistLayout } = setup();
    const page = await goToBurgosContent(user);
    await user.click(screen.getByRole('button', { name: 'Reordenar fotos' }));
    await user.click(within(page).getByRole('button', { name: /^Foto 1/ }));
    await user.click(within(page).getByRole('button', { name: /^Foto 2/ }));
    await user.click(
      await screen.findByRole('button', { name: /Volver al orden original de la página/ }),
    );
    await waitFor(() => {
      expect(persistLayout).toHaveBeenLastCalledWith(expect.objectContaining({ pages: {} }));
    });
  });

  it('descarga el PDF en la calidad elegida', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:pdf');
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { user, exportPdf } = setup();
    await user.click(await screen.findByText('Descargar PDF'));
    await user.click(screen.getByRole('button', { name: /Calidad de imprenta/ }));
    expect(exportPdf).toHaveBeenCalledWith('print');
    expect(await screen.findByText(/PDF listo/)).toBeInTheDocument();
    expect(click).toHaveBeenCalled();
  });

  it('muestra el error si el PDF falla', async () => {
    const { user } = setup({ exportPdf: () => Promise.reject(new Error('Chromium no arrancó')) });
    await user.click(await screen.findByText('Descargar PDF'));
    await user.click(screen.getByRole('button', { name: /Ligero/ }));
    expect(
      await screen.findByText('No se pudo generar el PDF: Chromium no arrancó'),
    ).toBeInTheDocument();
  });

  it('pone a pantalla completa solo el libro', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    const request = vi.fn(() => Promise.resolve());
    HTMLElement.prototype.requestFullscreen = request;
    const { user } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Ver el libro a pantalla completa' }),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toHaveClass('book-stage');
    Reflect.deleteProperty(document, 'fullscreenEnabled');
  });

  it('muestra un error claro si no puede cargar los textos del libro', async () => {
    render(
      <BookScreen
        loadData={() => Promise.resolve(bookDataFixture())}
        loadConfig={vi.fn(() =>
          Promise.reject(new Error('Falta config/book.json con los textos del libro.')),
        )}
        loadLayout={() => Promise.resolve(emptyLayout())}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta config/book.json');
  });
});
