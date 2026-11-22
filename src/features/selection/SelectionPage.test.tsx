import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Selection } from '../../../shared/manifest.ts';
import { selectionDataFixture } from '../../test/fixtures.ts';
import { SelectionPage } from './SelectionPage.tsx';

function setup(options: { save?: (s: Selection) => Promise<Selection> } = {}) {
  const save = vi.fn(options.save ?? ((s: Selection) => Promise.resolve(s)));
  const load = vi.fn(() => Promise.resolve(selectionDataFixture()));
  const user = userEvent.setup();
  render(<SelectionPage load={load} save={save} saveDelayMs={10} />);
  return { save, load, user };
}

describe('SelectionPage', () => {
  it('muestra los lugares por sección con su avance', async () => {
    setup();
    const nav = await screen.findByRole('navigation', { name: 'Lugares del álbum' });
    expect(within(nav).getByRole('heading', { name: 'Camino Francés' })).toBeInTheDocument();
    expect(
      within(nav).getByRole('heading', { name: 'Epílogo: Fisterra y Muxía' }),
    ).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Burgos 2/3' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(nav).getByRole('button', { name: 'León 2/3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Burgos' })).toBeInTheDocument();
  });

  it('muestra la preselección y marca las sugeridas y las elegidas', async () => {
    setup();
    const grid = await screen.findByRole('list', { name: 'Fotos de Burgos' });
    const checkboxes = within(grid).getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes.map((c) => (c as HTMLInputElement).checked)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(within(grid).getAllByText('Sugerida')).toHaveLength(2);
  });

  it('elige una foto, actualiza el avance y guarda automáticamente', async () => {
    const { save, user } = setup();
    await user.click(await screen.findByRole('checkbox', { name: /Elegir: Foto 3 de Burgos/ }));
    expect(screen.getByRole('button', { name: 'Burgos 3/3, completo' })).toBeInTheDocument();
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    expect(save.mock.calls[0]?.[0].places.burgos).toEqual(['b1', 'b2', 'b3']);
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
  });

  it('avisa al llegar al máximo en vez de añadir más', async () => {
    const { save, user } = setup();
    await user.click(await screen.findByRole('checkbox', { name: /Elegir: Foto 3 de Burgos/ }));
    await user.click(screen.getByRole('checkbox', { name: /Elegir: Foto 4 de Burgos/ }));
    expect(
      screen.getByText('Ya tienes 3 fotos en Burgos. Quita una para añadir otra.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Elegir: Foto 4 de Burgos/ })).not.toBeChecked();
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    expect(save.mock.calls[0]?.[0].places.burgos).toEqual(['b1', 'b2', 'b3']);
  });

  it('muestra todas las fotos del lugar y cambia de lugar', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Todas (5)' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: /^León/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'León' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preselección (2)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('filtra por cámara para ver solo las fotos de la Canon o del iPhone', async () => {
    const { user } = setup();
    const camera = await screen.findByRole('group', { name: 'Cámara' });
    expect(screen.getByText(/5 fotos \(1 Canon · 4 iPhone\)/)).toBeInTheDocument();
    await user.click(within(camera).getByRole('button', { name: 'Canon (1)' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: /Canon/ })).toBeInTheDocument();
    await user.click(within(camera).getByRole('button', { name: 'iPhone (3)' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    // Al cambiar de lugar vuelve a mostrar las dos cámaras (León solo tiene iPhone: sin filtro).
    await user.click(screen.getByRole('button', { name: /^León/ }));
    expect(screen.queryByRole('group', { name: 'Cámara' })).not.toBeInTheDocument();
  });
  it('restablece la sugerencia de un lugar', async () => {
    const { save, user } = setup();
    await user.click(await screen.findByRole('checkbox', { name: /Elegir: Foto 1 de Burgos/ }));
    await user.click(screen.getByRole('button', { name: 'Restablecer sugerencia' }));
    expect(screen.getByRole('checkbox', { name: /Elegir: Foto 1 de Burgos/ })).toBeChecked();
    await waitFor(() => {
      expect(save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          places: expect.objectContaining({ burgos: ['b1', 'b2'] }) as unknown,
        }),
      );
    });
  });

  it('abre la vista ampliada, pasa de foto con las flechas y permite elegir', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: /Ampliar: Foto 2 de Burgos/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/2 de 4/)).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', '/media/preview/b3.jpg');
    await user.click(within(dialog).getByRole('button', { name: 'Elegir' }));
    expect(within(dialog).getByRole('button', { name: '✓ Elegida' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra el error de guardado sin perder los cambios', async () => {
    const { user } = setup({ save: () => Promise.reject(new Error('disco lleno')) });
    await user.click(await screen.findByRole('checkbox', { name: /Elegir: Foto 3 de Burgos/ }));
    expect(await screen.findByText('No se pudo guardar: disco lleno')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Elegir: Foto 3 de Burgos/ })).toBeChecked();
  });

  it('muestra un mensaje claro si no hay fotos procesadas', async () => {
    const load = vi.fn(() =>
      Promise.reject(new Error('Aún no hay fotos procesadas. Ejecuta «npm run photos».')),
    );
    render(<SelectionPage load={load} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Aún no hay fotos procesadas. Ejecuta «npm run photos».');
  });

  it('no guarda nada si no hay cambios', async () => {
    const { save } = setup();
    await screen.findByRole('heading', { level: 2, name: 'Burgos' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(save).not.toHaveBeenCalled();
  });
});
