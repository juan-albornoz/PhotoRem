import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('arranque de la app', () => {
  test('carga la portada provisional y conecta con el servidor local', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Camino Francés · De Burgos a Muxía');
    await expect(page.getByRole('heading', { level: 1, name: 'De Burgos a Muxía' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(
      /Servidor local conectado \(v\d+\.\d+\.\d+\)/,
    );
  });

  test('no tiene errores de accesibilidad WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText(/conectado/);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('no muestra errores en la consola', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText(/conectado/);

    expect(errors).toEqual([]);
  });
});
