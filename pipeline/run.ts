import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { AlbumConfig, PlacesConfig } from '../shared/config.ts';
import { analyzeAll, assetName } from './analyze.ts';
import { buildCandidates, buildManifest, writeOutputs } from './build.ts';
import { estimateCanonOffset } from './calibrate.ts';
import { readExifBatch, type ExifRecord } from './exif.ts';
import { buildInventory, type Inventory } from './inventory.ts';
import {
  CACHE_DIR,
  DATA_DIR,
  MEDIA_DIR,
  loadAlbumConfig,
  loadCuration,
  loadPlacesConfig,
  resolveSource,
} from './paths.ts';
import { buildContactSheet } from './review.ts';
import { captureUtc, utcToLocal } from './time.ts';
import { buildTimeline } from './timeline.ts';

interface Context {
  config: AlbumConfig;
  placesConfig: PlacesConfig;
  inventory: Inventory;
  exif: Map<string, ExifRecord>;
}

async function loadContext(): Promise<Context> {
  const config = await loadAlbumConfig();
  const placesConfig = await loadPlacesConfig();
  const canonDir = resolveSource(config.sources.canon);
  const iphoneDir = resolveSource(config.sources.iphone);
  const inventory = await buildInventory(canonDir, iphoneDir);
  console.log(
    `Inventario: ${String(inventory.photos.length)} fotos, ${String(inventory.videos.length)} vídeos, ${String(inventory.ignored.length)} ignorados`,
  );
  const exif = await readExifBatch(
    [...inventory.photos.map((p) => p.master), ...inventory.videos],
    path.join(CACHE_DIR, 'exif.json'),
    (file) => !file.startsWith(canonDir),
    (done, total) => {
      console.log(`  EXIF ${String(done)}/${String(total)}`);
    },
  );
  return { config, placesConfig, inventory, exif };
}

async function calibrate(): Promise<void> {
  const { config, inventory, exif } = await loadContext();
  const canon: number[] = [];
  const phone: number[] = [];
  for (const file of [...inventory.photos.map((p) => p.master), ...inventory.videos]) {
    const record = exif.get(file);
    const isCanon = inventory.photos.some((p) => p.master === file && p.source === 'canon');
    const utc = record
      ? captureUtc(record, isCanon ? 'canon' : 'iphone', config.timeZone, 0)
      : null;
    if (utc !== null) (isCanon ? canon : phone).push(utc);
  }
  const result = estimateCanonOffset(canon, phone);
  console.log('Mejores desfases (minutos a sumar a la Canon → coincidencias a ±2 min):');
  for (const s of result.top) {
    console.log(`  ${String(s.offsetMinutes).padStart(5)} min → ${String(s.matches)}`);
  }
  console.log(`Corrección configurada: ${String(config.canonClockCorrectionSeconds)} s`);
}

async function assign(): Promise<void> {
  const { config, placesConfig, inventory, exif } = await loadContext();
  const tl = buildTimeline(
    inventory,
    exif,
    placesConfig.places,
    config.timeZone,
    config.canonClockCorrectionSeconds,
  );
  const tz = config.timeZone;
  console.log(`\nRecorrido del iPhone: ${String(tl.track.length)} puntos con GPS`);
  console.log('Llegadas (estimada · primera foto dentro del radio · foto anterior):');
  for (const a of tl.arrivals) {
    const name = placesConfig.places.find((p) => p.id === a.placeId)?.name ?? a.placeId;
    const prev = a.previous
      ? `${utcToLocal(a.previous.t, tz).slice(5, 16).replace('T', ' ')} a ${a.previous.distanceKm.toFixed(1)} km`
      : '—';
    console.log(
      `  ${name.padEnd(24)} ${utcToLocal(a.t, tz).slice(5, 16).replace('T', ' ')} · ${utcToLocal(a.firstInsideT, tz).slice(5, 16).replace('T', ' ')} (${a.method}, ${a.distanceKm.toFixed(1)} km) · ${prev}`,
    );
  }
  console.log(`Fin del viaje: ${utcToLocal(tl.endT, tz).replace('T', ' ')}`);
  console.log('\nFotos por lugar (Canon / iPhone · días):');
  for (const place of placesConfig.places) {
    const ps = tl.photos.filter((p) => p.placeId === place.id);
    const canon = ps.filter((p) => p.item.source === 'canon').length;
    const days = [...new Set(ps.map((p) => utcToLocal(p.t, tz).slice(5, 10)))].join(' ');
    console.log(
      `  ${place.name.padEnd(24)} ${String(ps.length).padStart(4)} (${String(canon)} / ${String(ps.length - canon)})  ${days}`,
    );
  }
  const outside = tl.photos.filter((p) => p.placeId === null);
  const outsideDays = [...new Set(outside.map((p) => utcToLocal(p.t, tz).slice(0, 10)))].join(', ');
  console.log(`  Fuera del viaje: ${String(outside.length)} (${outsideDays})`);
  const noGps = tl.photos.filter((p) => p.gps === null).length;
  const approx = tl.photos.filter((p) => p.gps?.approx).length;
  console.log(
    `GPS: ${String(tl.photos.length - noGps - approx)} exacto, ${String(approx)} aproximado, ${String(noGps)} sin posición`,
  );
  console.log(`Descartadas: ${String(tl.rejected.length)}`);
  const reasons = new Map<string, number>();
  for (const r of tl.rejected) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
  for (const [reason, n] of reasons) console.log(`  ${reason}: ${String(n)}`);
}

async function analyze(): Promise<void> {
  const { config, placesConfig, inventory, exif } = await loadContext();
  const tl = buildTimeline(
    inventory,
    exif,
    placesConfig.places,
    config.timeZone,
    config.canonClockCorrectionSeconds,
  );
  const items = tl.photos
    .filter((p) => p.placeId !== null)
    .map((p) => ({ id: p.item.id, master: p.item.master }));
  console.log(`Analizando ${String(items.length)} fotos del viaje…`);
  const t0 = Date.now();
  const { results, failures } = await analyzeAll(
    items,
    {
      thumbs: path.join(MEDIA_DIR, 'thumbs'),
      previews: path.join(MEDIA_DIR, 'preview'),
      cacheFile: path.join(CACHE_DIR, 'analysis.json'),
      heicCache: path.join(CACHE_DIR, 'heic'),
    },
    (done, total) => {
      console.log(
        `  ${String(done)}/${String(total)} (${String(Math.round((Date.now() - t0) / 1000))} s)`,
      );
    },
  );
  console.log(
    `Analizadas: ${String(results.size)} en ${String(Math.round((Date.now() - t0) / 1000))} s. Fallos: ${String(failures.length)}`,
  );
  for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
}

function percentile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

/** Proceso completo: análisis (con caché), manifiesto, candidatas, selección inicial y hojas de contacto. */
async function build(): Promise<void> {
  const { config, placesConfig, inventory, exif } = await loadContext();
  const tl = buildTimeline(
    inventory,
    exif,
    placesConfig.places,
    config.timeZone,
    config.canonClockCorrectionSeconds,
  );
  const items = tl.photos
    .filter((p) => p.placeId !== null)
    .map((p) => ({ id: p.item.id, master: p.item.master }));
  const { results, failures } = await analyzeAll(items, {
    thumbs: path.join(MEDIA_DIR, 'thumbs'),
    previews: path.join(MEDIA_DIR, 'preview'),
    cacheFile: path.join(CACHE_DIR, 'analysis.json'),
    heicCache: path.join(CACHE_DIR, 'heic'),
  });
  for (const f of failures) console.log(`  No se pudo analizar ${f.id}: ${f.error}`);

  const focus = [...results.values()].map((a) => a.focus).sort((a, b) => a - b);
  console.log(
    `Nitidez (percentil 90 por bloques) · p5 ${String(Math.round(percentile(focus, 0.05)))} · p10 ${String(Math.round(percentile(focus, 0.1)))} · p25 ${String(Math.round(percentile(focus, 0.25)))} · mediana ${String(Math.round(percentile(focus, 0.5)))} · p90 ${String(Math.round(percentile(focus, 0.9)))} · umbral ${String(config.preselection.minFocus)}`,
  );

  const manifest = buildManifest(tl, results, placesConfig.places, config);
  const candidates = buildCandidates(manifest, placesConfig.places, config, await loadCuration());
  const { selectionCreated } = await writeOutputs(DATA_DIR, manifest, candidates);

  const reviewDir = path.join(MEDIA_DIR, 'review');
  await mkdir(reviewDir, { recursive: true });
  const byId = new Map(manifest.photos.map((p) => [p.id, p]));
  console.log(
    '\nLugar                    fotos  movidas  ráfagas→  candidatas (verticales)  sugeridas',
  );
  for (const [index, place] of placesConfig.places.entries()) {
    const entry = candidates.places.find((c) => c.placeId === place.id);
    if (!entry) continue;
    const ps = manifest.photos.filter((p) => p.placeId === place.id);
    const clusters = new Set(ps.map((p) => p.clusterId)).size;
    const blurry = ps.filter((p) => p.quality.blurry).length;
    const vertical = entry.candidates.filter(
      (id) => byId.get(id)?.orientation === 'portrait',
    ).length;
    console.log(
      `  ${place.name.padEnd(24)} ${String(ps.length).padStart(4)}  ${String(blurry).padStart(6)}  ${String(clusters).padStart(8)}  ${String(entry.candidates.length).padStart(10)} (${String(vertical)})  ${String(entry.suggested.length).padStart(9)}`,
    );
    const suggested = new Set(entry.suggested);
    await buildContactSheet(
      `${String(index + 1).padStart(2, '0')} · ${place.name} — ${String(entry.candidates.length)} candidatas de ${String(ps.length)} (★ = sugeridas)`,
      entry.candidates.map((id, i) => {
        const p = byId.get(id);
        if (!p) throw new Error(`Candidata desconocida: ${id}`);
        return {
          thumb: path.join(MEDIA_DIR, 'thumbs', assetName(id)),
          label: `${String(i + 1)} · ${p.localTime.slice(5, 16).replace('T', ' ')} · ${p.source === 'canon' ? 'Canon' : 'iPhone'} · f${String(p.quality.focus)}`,
          star: suggested.has(id),
        };
      }),
      path.join(reviewDir, `${String(index + 1).padStart(2, '0')}-${place.id}.jpg`),
    );
  }
  console.log(
    `\nManifiesto: ${String(manifest.photos.length)} fotos · ${selectionCreated ? 'selección inicial creada con las sugeridas' : 'tu selección se conserva (no se toca)'}`,
  );
  console.log(`Hojas de contacto en ${reviewDir}`);
}

const command = process.argv[2] ?? 'build';
const commands: Record<string, () => Promise<void>> = { calibrate, assign, analyze, build };
const run = commands[command];
if (!run) {
  console.error(`Comando desconocido: ${command}. Opciones: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
await run();
