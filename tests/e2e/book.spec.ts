import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { bookConfigFixture, bookDataFixture } from '../../src/test/fixtures.ts';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/selection-data', (route) => route.fulfill({ json: bookDataFixture() }));
  await page.route('**/api/book-config', (route) => route.fulfill({ json: bookConfigFixture() }));
  await page.route('**/media/**', (route) =>
    route.fulfill({ body: PIXEL, contentType: 'image/png' }),
  );
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
    await expect(page.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
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
});
