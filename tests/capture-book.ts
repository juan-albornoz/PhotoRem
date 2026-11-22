// Herramienta de revisión (no es una prueba): capturas de varias dobles páginas del libro.
// Uso: npx tsx tests/capture-book.ts <carpeta-salida> [vista1,vista2,...]
import path from 'node:path';

import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const wanted = (process.argv[3] ?? '0,1,2,3,4,5,6').split(',').map(Number);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto('http://127.0.0.1:5173/#/libro');
await page.getByRole('button', { name: 'Página siguiente' }).waitFor();
let current = 0;
for (const target of wanted.sort((a, b) => a - b)) {
  while (current < target) {
    await page.keyboard.press('ArrowRight');
    current += 1;
  }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  const where = await page.locator('.book-toolbar__where').innerText();
  const file = path.join(out, `libro_${String(target).padStart(2, '0')}.png`);
  await page.locator('.book-stage').screenshot({ path: file });
  console.log(`${file}\t${where}`);
}
if (errors.length) console.log('ERRORES:\n' + errors.join('\n'));
await browser.close();
