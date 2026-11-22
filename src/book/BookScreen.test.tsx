import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { bookConfigFixture, bookDataFixture } from '../test/fixtures.ts';
import { BookScreen } from './BookScreen.tsx';

function setup() {
  const user = userEvent.setup();
  render(
    <BookScreen
      loadData={() => Promise.resolve(bookDataFixture())}
      loadConfig={() => Promise.resolve(bookConfigFixture())}
    />,
  );
  return { user };
}

describe('BookScreen (modo lectura)', () => {
  it('abre por la portada con el título del libro', async () => {
    setup();
    const cover = await screen.findByRole('article', { name: 'Portada' });
    expect(within(cover).getByText('Camino Francés')).toBeInTheDocument();
    expect(within(cover).getByText('De Burgos a Muxía')).toBeInTheDocument();
    expect(screen.getByText('Portada', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  });

  it('pasa página con los botones y con las flechas del teclado', async () => {
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
    const leon = within(jump).getByRole('option', { name: /^León/ });
    await user.selectOptions(jump, leon);
    const page = screen.getByRole('article', { name: /León$/ });
    expect(within(page).getByText('León', { selector: '.book-text--display' })).toBeInTheDocument();
    expect(within(page).getByText(/León · 14–15 oct 2026/)).toBeInTheDocument();
  });

  it('describe cada foto del libro para lectores de pantalla', async () => {
    const { user } = setup();
    const jump = await screen.findByRole('combobox', { name: 'Ir a' });
    await user.selectOptions(jump, within(jump).getByRole('option', { name: /^Burgos/ }));
    // Con el foco en el desplegable las flechas no pasan página (para no estorbarlo): se usa el botón.
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getAllByRole('img').every((img) => img.getAttribute('alt'))).toBe(true);
  });

  it('muestra un error claro si no puede cargar los textos del libro', async () => {
    render(
      <BookScreen
        loadData={() => Promise.resolve(bookDataFixture())}
        loadConfig={vi.fn(() =>
          Promise.reject(new Error('Falta config/book.json con los textos del libro.')),
        )}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta config/book.json');
  });
});
