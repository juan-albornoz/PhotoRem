/// <reference lib="dom" />
// Herramienta de revisión (no es una prueba): capturas del libro normal y a pantalla completa.
// Uso: npx tsx tests/capture-fullscreen.ts <carpeta-salida>
import path from 'node:path';

import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const failed: string[] = [];
page.on('response', (r) => {
  if (r.url().includes('/api/image') && r.status() >= 400)
    failed.push(`${String(r.status())} ${r.url()}`);
});
await page.goto('http://127.0.0.1:5173/#/libro');
await page.getByRole('button', { name: 'Página siguiente' }).waitFor();
for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);
const broken = await page.evaluate(
  () =>
    Array.from(document.querySelectorAll('.book-page img')).filter(
      (img) => !(img as HTMLImageElement).complete || (img as HTMLImageElement).naturalWidth === 0,
    ).length,
);
const chosen = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.book-page img')).map((img) =>
    (img as HTMLImageElement).currentSrc.replace(location.origin, ''),
  ),
);
await page.screenshot({ path: path.join(out, 'normal.png') });
await page.getByRole('button', { name: 'Ver el libro a pantalla completa' }).click();
await page.waitForTimeout(800);
const inFullscreen = await page.evaluate(() => document.fullscreenElement?.className ?? '(nada)');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);
const chosenFull = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.book-page img')).map((img) =>
    (img as HTMLImageElement).currentSrc.replace(location.origin, ''),
  ),
);
await page.screenshot({ path: path.join(out, 'pantalla-completa.png') });
console.log(
  `fotos sin cargar: ${String(broken)} · respuestas de imagen con error: ${String(failed.length)}`,
);
console.log(`elemento a pantalla completa: ${inFullscreen}`);
console.log(`normal: ${chosen.slice(0, 3).join(' | ')}`);
console.log(`pantalla completa: ${chosenFull.slice(0, 3).join(' | ')}`);
await browser.close();
