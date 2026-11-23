import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { z } from 'zod';

import type { HealthResponse } from '../shared/api.ts';
import { WEB_ORIGIN } from './config.ts';
import { croppedImage, sizedImage, type ImageDirs } from './images.ts';
import { exportPdf, type PdfExporter } from './pdf.ts';
import {
  StoreError,
  loadBookConfig,
  loadLayout,
  loadSelectionData,
  saveLayout,
  saveSelection,
  type StoreDirs,
} from './store.ts';

export const APP_VERSION = '0.4.0';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface ServerOptions {
  logger?: boolean;
  /** Carpeta de la app (`album/`): las rutas del manifiesto son relativas a ella. */
  appRoot?: string;
  configDir?: string;
  dataDir?: string;
  mediaDir?: string;
  /** Inyectable para las pruebas (por defecto, Chromium con Playwright). */
  exporter?: PdfExporter;
  webOrigin?: string;
}

const SizedQuery = z.object({ id: z.string().min(1), w: z.coerce.number().int() });
const CropQuery = z.object({
  id: z.string().min(1),
  aspect: z.coerce.number(),
  cx: z.coerce.number().default(0.5),
  cy: z.coerce.number().default(0.5),
  scale: z.coerce.number().default(1),
  w: z.coerce.number().int(),
});
const ExportBody = z.object({ quality: z.enum(['print', 'light']) });

/** Crea la instancia del servidor sin arrancarla, para poder probarla con `inject`. */
export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 2 * 1024 * 1024 });
  const appRoot = options.appRoot ?? APP_ROOT;
  const dirs: StoreDirs = {
    configDir: options.configDir ?? path.join(appRoot, 'config'),
    dataDir: options.dataDir ?? path.join(appRoot, 'data'),
  };
  const mediaDir = options.mediaDir ?? path.join(appRoot, 'media');
  const imageDirs: ImageDirs = { appRoot, dataDir: dirs.dataDir, mediaDir };
  const exporter = options.exporter ?? exportPdf;
  const webOrigin = options.webOrigin ?? WEB_ORIGIN;
  mkdirSync(mediaDir, { recursive: true });

  // Miniaturas, vistas previas y tamaños generados. Nunca se sirven los archivos originales.
  void app.register(fastifyStatic, {
    root: mediaDir,
    prefix: '/media/',
    maxAge: '1h',
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof StoreError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: 'Parámetros no válidos.' });
    }
    app.log.error(error);
    return reply.status(500).send({ error: 'Error inesperado del servidor local.' });
  });

  /**
   * Envía un archivo generado en `media/` con caché larga (su nombre ya identifica su contenido).
   * La ruta va con barras «/»: en Windows, `path.relative` da «\» y @fastify/static la rechaza.
   */
  const sendMedia = (reply: FastifyReply, file: string): FastifyReply =>
    reply
      .header('cache-control', 'public, max-age=31536000, immutable')
      .sendFile(path.relative(mediaDir, file).split(path.sep).join('/'));

  app.get('/api/health', (): HealthResponse => ({
    status: 'ok',
    service: 'album-camino',
    version: APP_VERSION,
  }));

  app.get('/api/selection-data', () => loadSelectionData(dirs));
  app.get('/api/book-config', () => loadBookConfig(dirs));
  app.put('/api/selection', async (request) => saveSelection(dirs, request.body));

  app.get('/api/layout', () => loadLayout(dirs));
  app.put('/api/layout', async (request) => saveLayout(dirs, request.body));

  // Foto completa a un ancho de la lista (srcset de pantalla y pantalla completa).
  app.get('/api/image', async (request, reply) => {
    const { id, w } = SizedQuery.parse(request.query);
    return sendMedia(reply, await sizedImage(imageDirs, id, w));
  });

  // Foto recortada exactamente a su hueco y al ancho pedido (impresión y PDF).
  app.get('/api/image/crop', async (request, reply) => {
    const q = CropQuery.parse(request.query);
    const file = await croppedImage(imageDirs, {
      id: q.id,
      aspect: q.aspect,
      centerX: q.cx,
      centerY: q.cy,
      scale: q.scale,
      width: q.w,
    });
    return sendMedia(reply, file);
  });

  // Exportación a PDF: de una en una (es pesada).
  let exporting = false;
  app.post('/api/export/pdf', async (request, reply) => {
    const { quality } = ExportBody.parse(request.body);
    if (exporting) throw new StoreError('Ya se está generando un PDF. Espera a que termine.', 409);
    exporting = true;
    let pdf: Buffer;
    try {
      pdf = await exporter(webOrigin, quality);
    } finally {
      exporting = false;
    }
    const name = quality === 'print' ? 'camino-frances-imprenta.pdf' : 'camino-frances.pdf';
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${name}"`)
      .send(pdf);
  });

  return app;
}
