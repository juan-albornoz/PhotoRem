/// <reference lib="dom" />
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { bookConfigFixture, bookDataFixture } from '../../src/test/fixtures.ts';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Simula el servidor local. Burgos con sus cinco fotos elegidas, para tener páginas con varias. */
async function mockApi(page: Page): Promise<{ layouts: unknown[] }> {
  const data = bookDataFixture();
  data.selection.places.burgos = ['b1', 'b2', 'b3', 'b4', 'b5'];
  const layouts: unknown[] = [];
  await page.route('**/api/selection-data', (route) => route.fulfill({ json: data }));
  await page.route('**/api/book-config', (route) => route.fulfill({ json: bookConfigFixture() }));
  await page.route('**/api/layout', async (route) => {
    if (route.request().method() === 'PUT') {
      const body: unknown = route.request().postDataJSON();
      layouts.push(body);
      await route.fulfill({ json: body });
    } else {
      await route.fulfill({ json: { version: 1, updatedAt: '', pages: {} } });
    }
  });
  await page.route('**/api/export/pdf', (route) =>
    route.fulfill({
      body: Buffer.from('%PDF-1.7 prueba'),
      contentType: 'application/pdf',
      headers: { 'content-disposition': 'attachment; filename="camino-frances.pdf"' },
    }),
  );
  for (const pattern of ['**/media/**', '**/api/image**']) {
    await page.route(pattern, (route) => route.fulfill({ body: PIXEL, contentType: 'image/png' }));
  }
  return { layouts };
}

/** Avanza hasta la primera vista con una página de Burgos que tenga varias fotos. */
async function goToBurgosContent(page: Page) {
  await jumpTo(page, 'Burgos');
  for (let i = 0; i < 6; i += 1) {
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    const pages = page.getByRole('article', { name: /^Página \d+: Burgos/ });
    for (const candidate of await pages.all()) {
      if ((await candidate.getByRole('img').count()) >= 2) return candidate;
    }
  }
  throw new Error('No hay ninguna página de Burgos con varias fotos');
}

/** Elige en «Ir a» la opción que empieza por `prefix` (las etiquetas llevan el número de página). */
async function jumpTo(page: Page, prefix: string): Promise<void> {
  const select = page.getByRole('combobox', { name: 'Ir a' });
  const label = await select
    .locator('option')
    .filter({ hasText: new RegExp(`^${prefix}`) })
    .first()
    .textContent();
  await select.selectOption({ label: label ?? prefix });
}

test.describe('libro (modo lectura)', () => {
  test('abre por la portada, sola y centrada', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/libro');
    const cover = page.getByRole('article', { name: 'Portada' });
    await expect(cover).toBeVisible();
    await expect(cover.getByText('Camino Francés')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    // En la portada no hay página anterior: su flecha no se muestra.
    await expect(page.locator('.book-arrow--prev')).toBeHidden();
  });

  test('pasa página con botones y teclado; doble página en escritorio, simple en móvil', async ({
    page,
    isMobile,
  }) => {
    await mockApi(page);
    await page.goto('/#/libro');
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(page.getByRole('article', { name: /^Página 1/ })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    if (isMobile) {
      await expect(page.getByText('Página 2 de', { exact: false })).toBeVisible();
      await expect(page.getByRole('article')).toHaveCount(1);
    } else {
      await expect(page.getByText(/Páginas 2–3 de \d+/)).toBeVisible();
      await expect(page.getByRole('article')).toHaveCount(2);
    }
    await page.keyboard.press('End');
    await expect(page.getByRole('article', { name: 'Contraportada' })).toBeVisible();
    await page.keyboard.press('Home');
    await expect(page.getByRole('article', { name: 'Portada' })).toBeVisible();
  });

  test('salta a un capítulo: apertura con título, etapas, resumen y folio', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/libro');
    await jumpTo(page, 'León');
    const opening = page.getByRole('article', { name: /León$/ }).first();
    await expect(opening.getByText('León', { exact: true })).toBeVisible();
    await expect(opening.getByText('Resumen de León.')).toBeVisible();
    await expect(opening.getByText(/León · 14–15 oct 2026/)).toBeVisible();
  });

  test('sin errores de accesibilidad WCAG 2.1 AA (portada, índice y capítulo)', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/#/libro');
    await expect(page.getByRole('article', { name: 'Portada' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

    await jumpTo(page, 'Índice');
    await expect(
      page.getByRole('article', { name: /^Página 3/ }).getByText('Índice'),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

    await jumpTo(page, 'Burgos');
    await expect(page.getByText('Resumen de Burgos.')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  });

  test('las pestañas llevan del libro a la selección y vuelta', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Libro' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Selección de fotos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Elige tus fotos' })).toBeVisible();
    await page.getByRole('link', { name: 'Libro' }).click();
    await expect(page.getByRole('article', { name: 'Portada' })).toBeVisible();
  });

  test('flechas pequeñas a los lados del libro, centradas en vertical', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/libro');
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    const book = await page.locator('.book-spread').boundingBox();
    const prev = await page.getByRole('button', { name: 'Página anterior' }).boundingBox();
    const next = await page.getByRole('button', { name: 'Página siguiente' }).boundingBox();
    if (!book || !prev || !next) throw new Error('sin cajas');
    const middle = book.y + book.height / 2;
    expect(Math.abs(prev.y + prev.height / 2 - middle)).toBeLessThan(4);
    expect(Math.abs(next.y + next.height / 2 - middle)).toBeLessThan(4);
    expect(prev.x + prev.width).toBeLessThanOrEqual(book.x + 2);
    expect(next.x).toBeGreaterThanOrEqual(book.x + book.width - 2);
    expect(prev.width).toBeLessThanOrEqual(40);
    // Sin texto visible: solo el símbolo.
    await expect(page.getByRole('button', { name: 'Página siguiente' })).toHaveText('');
  });

  test('pantalla completa: solo el libro, con un icono pequeño para entrar y salir', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/#/libro');
    const enter = page.getByRole('button', { name: 'Ver el libro a pantalla completa' });
    await expect(enter).toHaveText('');
    await enter.click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.className ?? ''))
      .toContain('book-stage');
    const toolbarInside = await page.evaluate(
      () => document.fullscreenElement?.querySelector('.book-toolbar') !== null,
    );
    expect(toolbarInside).toBe(false);
    await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  });

  test('reordena las fotos de una página arrastrando una sobre otra', async ({ page }) => {
    const { layouts } = await mockApi(page);
    await page.goto('/#/libro');
    const content = await goToBurgosContent(page);
    const srcs = async (): Promise<(string | null)[]> =>
      Promise.all((await content.getByRole('img').all()).map((img) => img.getAttribute('src')));
    const before = await srcs();
    await page.getByRole('button', { name: 'Reordenar fotos' }).click();
    await content
      .getByRole('button', { name: /^Foto 1/ })
      .dragTo(content.getByRole('button', { name: /^Foto 2/ }));
    await expect.poll(() => layouts.length).toBe(1);
    const after = await srcs();
    expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
    await expect(page.getByText(/Orden guardado/)).toBeVisible();
  });

  test('descarga el libro en PDF', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/libro');
    await page.getByText('Descargar PDF').click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Ligero/ }).click();
    expect((await download).suggestedFilename()).toBe('camino-frances.pdf');
    await expect(page.getByText(/PDF listo/)).toBeVisible();
  });
});
