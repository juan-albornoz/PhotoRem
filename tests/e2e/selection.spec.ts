import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type { Selection } from '../../shared/manifest.ts';
import { selectionDataFixture } from '../../src/test/fixtures.ts';

/** PNG de 1×1 para no depender de tus miniaturas reales. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Simula el servidor local y devuelve las selecciones que la app intenta guardar. */
async function mockApi(page: Page): Promise<Selection[]> {
  const saved: Selection[] = [];
  await page.route('**/api/selection-data', (route) =>
    route.fulfill({ json: selectionDataFixture() }),
  );
  await page.route('**/api/selection', async (route) => {
    const body = route.request().postDataJSON() as Selection;
    saved.push(body);
    await route.fulfill({ json: body });
  });
  await page.route('**/media/**', (route) =>
    route.fulfill({ body: PIXEL, contentType: 'image/png' }),
  );
  return saved;
}

test.describe('selección de fotos', () => {
  test('elige una foto y se guarda sola', async ({ page }) => {
    const saved = await mockApi(page);
    await page.goto('/#/seleccion');

    await expect(page.getByRole('heading', { level: 1, name: 'Elige tus fotos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Burgos 2/3', exact: true })).toBeVisible();

    await page.getByRole('checkbox', { name: /Elegir: Foto 3 de Burgos/ }).check();
    await expect(page.getByRole('button', { name: /^Burgos 3\/3 ?, completo$/ })).toBeVisible();
    await expect(page.getByText('Cambios guardados')).toBeVisible();
    expect(saved.at(-1)?.places.burgos).toEqual(['b1', 'b2', 'b3']);
  });

  test('no deja pasar del máximo y lo explica', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/seleccion');
    await page.getByRole('checkbox', { name: /Elegir: Foto 3 de Burgos/ }).check();
    await page.getByRole('checkbox', { name: /Elegir: Foto 4 de Burgos/ }).click();
    await expect(
      page.getByText('Ya tienes 3 fotos en Burgos. Quita una para añadir otra.'),
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /Elegir: Foto 4 de Burgos/ }),
    ).not.toBeChecked();
  });

  test('vista ampliada: teclado, elegir y foco de vuelta al cerrar', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/seleccion');
    const opener = page.getByRole('button', { name: /Ampliar: Foto 2 de Burgos/ });
    await opener.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/2 de 4/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText(/3 de 4/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Elegir' }).click();
    await expect(dialog.getByRole('button', { name: '✓ Elegida' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.getByRole('checkbox', { name: /Elegir: Foto 3 de Burgos/ })).toBeChecked();
  });

  test('cambia de lugar y de vista', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/seleccion');
    await page.getByRole('button', { name: 'Todas (5)' }).click();
    await expect(
      page.getByRole('list', { name: 'Fotos de Burgos' }).getByRole('listitem'),
    ).toHaveCount(5);
    await page.getByRole('button', { name: /^Muxía/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Muxía', exact: true })).toBeVisible();
  });

  test('sin errores de accesibilidad WCAG 2.1 AA (página y vista ampliada)', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/seleccion');
    await expect(page.getByRole('heading', { level: 2, name: 'Burgos' })).toBeVisible();
    const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);

    await page.getByRole('button', { name: /Ampliar: Foto 1 de Burgos/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);
  });
});
