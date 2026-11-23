/**
 * Exportación a PDF: Chromium abre la página de impresión del libro (la misma maqueta que ves en
 * pantalla, a tamaño real en mm) y la imprime a PDF. No son capturas: el texto queda como texto con
 * las fuentes incrustadas, y cada foto va recortada a su hueco a 300 ppp (o 150 en la versión ligera).
 */

export type PdfQuality = 'print' | 'light';

export type PdfExporter = (origin: string, quality: PdfQuality) => Promise<Buffer>;

/** Tiempo máximo para que carguen todas las fotos de la página de impresión. */
const READY_TIMEOUT_MS = 10 * 60_000;

export const exportPdf: PdfExporter = async (origin, quality) => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/#/imprimir?calidad=${quality}`, { waitUntil: 'load' });
    // La página de impresión marca el body cuando todas las fotos han cargado.
    await page.waitForSelector('body[data-print-ready="true"]', { timeout: READY_TIMEOUT_MS });
    const failed = await page.getAttribute('body', 'data-print-errors');
    if (failed && failed !== '0') {
      throw new Error(`No se pudieron cargar ${failed} fotos para el PDF`);
    }
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};
