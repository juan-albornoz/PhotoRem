import { describe, expect, it } from 'vitest';

import { bookConfigFixture, bookDataFixture } from '../test/fixtures.ts';
import { generateBook } from './layout/generate.ts';
import { buildViews, describeView, viewIndexOf, viewPages } from './views.ts';

const data = bookDataFixture();
const book = generateBook({
  config: bookConfigFixture(),
  data: { ...data, selection: data.selection.places },
});

describe('vistas del libro', () => {
  it('doble página: portada sola, página 1 sola a la derecha, pares y contraportada sola', () => {
    const views = buildViews(book, 'spread');
    expect(views[0]).toEqual({ left: null, right: book.cover });
    expect(views[1]).toEqual({ left: null, right: book.pages[0] });
    expect(viewPages(views[2] ?? { left: null, right: null }).map((p) => p.number)).toEqual([2, 3]);
    expect(views.at(-1)).toEqual({ left: book.back, right: null });
    expect(views).toHaveLength(1 + 1 + (book.pages.length - 1) / 2 + 1);
  });

  it('página suelta: todas las páginas una a una', () => {
    expect(buildViews(book, 'single')).toHaveLength(book.pages.length + 2);
  });

  it('describe dónde estás', () => {
    const views = buildViews(book, 'spread');
    const total = book.pages.length;
    expect(describeView(views[0] ?? { left: null, right: null }, total)).toBe('Portada');
    expect(describeView(views[1] ?? { left: null, right: null }, total)).toBe(
      `Página 1 de ${String(total)}`,
    );
    expect(describeView(views[2] ?? { left: null, right: null }, total)).toBe(
      `Páginas 2–3 de ${String(total)}`,
    );
    expect(describeView(views.at(-1) ?? { left: null, right: null }, total)).toBe('Contraportada');
  });

  it('encuentra la vista de una página', () => {
    const views = buildViews(book, 'spread');
    expect(viewIndexOf(views, 'p3')).toBe(2);
    expect(viewIndexOf(views, 'no-existe')).toBe(0);
  });
});
