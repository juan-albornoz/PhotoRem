import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bookConfigFixture, bookDataFixture } from '../test/fixtures.ts';
import { BookViewer } from './BookViewer.tsx';
import { generateBook } from './layout/generate.ts';
import type { PageTurnSound } from './pageTurnSound.ts';

const data = bookDataFixture();
const book = generateBook({
  config: bookConfigFixture(),
  data: { ...data, selection: data.selection.places },
});
const photosById = new Map(data.photos.map((p) => [p.id, p]));

function setup() {
  const sound = { play: vi.fn(), setEnabled: vi.fn() } satisfies PageTurnSound;
  const user = userEvent.setup();
  render(<BookViewer book={book} photosById={photosById} places={data.places} sound={sound} />);
  return { sound, user };
}

describe('BookViewer: sonido al pasar página', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('suena una hoja al pasar página con las flechas laterales, hacia delante y hacia atrás', async () => {
    const { sound, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(sound.play).toHaveBeenLastCalledWith('next', { riffle: false });
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(sound.play).toHaveBeenLastCalledWith('prev', { riffle: false });
    expect(sound.play).toHaveBeenCalledTimes(2);
  });

  it('suena también con el teclado, y no suena si no hay página a la que ir', async () => {
    const { sound, user } = setup();
    await user.keyboard('{ArrowLeft}'); // en la portada: no hay página anterior
    expect(sound.play).not.toHaveBeenCalled();
    await user.keyboard('{ArrowRight}');
    expect(sound.play).toHaveBeenLastCalledWith('next', { riffle: false });
    await user.keyboard('{End}'); // saltar al final: suena como hojear varias
    expect(sound.play).toHaveBeenLastCalledWith('next', { riffle: true });
  });

  it('al saltar a un capítulo suena como hojear varias páginas', async () => {
    const { sound, user } = setup();
    const jump = screen.getByRole('combobox', { name: 'Ir a' });
    await user.selectOptions(jump, within(jump).getByRole('option', { name: /^León/ }));
    expect(sound.play).toHaveBeenLastCalledWith('next', { riffle: true });
  });

  it('el altavoz silencia el sonido, lo recuerda y al activarlo suena una hoja de muestra', async () => {
    const { sound, user } = setup();
    const speaker = screen.getByRole('button', { name: 'Sonido al pasar página' });
    expect(speaker).toHaveAttribute('aria-pressed', 'true');
    await user.click(speaker);
    expect(sound.setEnabled).toHaveBeenLastCalledWith(false);
    expect(speaker).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('photorem:sonido-paginas')).toBe('off');
    await user.click(speaker);
    expect(sound.setEnabled).toHaveBeenLastCalledWith(true);
    expect(sound.play).toHaveBeenLastCalledWith('next');
    expect(localStorage.getItem('photorem:sonido-paginas')).toBe('on');
  });

  it('respeta la preferencia guardada al abrir el libro', () => {
    localStorage.setItem('photorem:sonido-paginas', 'off');
    const { sound } = setup();
    expect(sound.setEnabled).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Sonido al pasar página' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
