import type { Book, Page } from '../../shared/book.ts';

/** Lo que se ve a la vez: una doble página (escritorio) o una página suelta (móvil). */
export interface View {
  left: Page | null;
  right: Page | null;
}

export type ViewMode = 'spread' | 'single';

/**
 * Vistas del libro. En doble página: la portada sola a la derecha; la página 1 a la derecha (al abrir
 * la tapa, la izquierda es la guarda); después pares izquierda-derecha; y la contraportada sola.
 */
export function buildViews(book: Book, mode: ViewMode): View[] {
  if (mode === 'single') {
    return [book.cover, ...book.pages, book.back].map((page) =>
      page.side === 'left' ? { left: page, right: null } : { left: null, right: page },
    );
  }
  const views: View[] = [{ left: null, right: book.cover }];
  let i = 0;
  const first = book.pages[0];
  if (first?.side === 'right') {
    views.push({ left: null, right: first });
    i = 1;
  }
  for (; i < book.pages.length; i += 2) {
    views.push({ left: book.pages[i] ?? null, right: book.pages[i + 1] ?? null });
  }
  views.push({ left: book.back, right: null });
  return views;
}

export function viewPages(view: View): Page[] {
  return [view.left, view.right].filter((p): p is Page => p !== null);
}

/** Índice de la vista que contiene la página `pageId` (0 si no la encuentra). */
export function viewIndexOf(views: readonly View[], pageId: string): number {
  const index = views.findIndex((v) => v.left?.id === pageId || v.right?.id === pageId);
  return index < 0 ? 0 : index;
}

/** Texto del indicador: «Portada», «Página 1», «Páginas 6–7 de 99», «Contraportada». */
export function describeView(view: View, totalPages: number): string {
  const pages = viewPages(view);
  if (pages.some((p) => p.kind === 'cover')) return 'Portada';
  if (pages.some((p) => p.kind === 'back')) return 'Contraportada';
  const numbers = pages.map((p) => p.number).filter((n): n is number => n !== null);
  if (numbers.length === 0) return '';
  const range =
    numbers.length === 1
      ? `Página ${String(numbers[0])}`
      : `Páginas ${String(numbers[0])}–${String(numbers.at(-1))}`;
  return `${range} de ${String(totalPages)}`;
}
