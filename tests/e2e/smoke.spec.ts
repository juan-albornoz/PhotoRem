import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Arranque con el servidor local de verdad (y tus datos, si ya ejecutaste `npm run photos`).
 * Las pruebas detalladas de la selección usan datos simulados (selection.spec.ts).
 */
test.describe('arranque de la app', () => {
  test('carga y conecta con el servidor local', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Camino Francés · De Burgos a Muxía');
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeAttached();
    await expect(page.getByText(/Servidor local conectado \(v\d+\.\d+\.\d+\)/)).toBeVisible();
  });

  test('no muestra errores en la consola', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page.getByText(/Servidor local conectado/)).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(errors).toEqual([]);
  });

  test('no tiene errores de accesibilidad WCAG 2.1 AA con tus datos reales', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Servidor local conectado/)).toBeVisible();
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
