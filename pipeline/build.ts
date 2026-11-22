import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AlbumConfig, Curation, Place } from '../shared/config.ts';
import {
  CandidatesSchema,
  ManifestSchema,
  SelectionSchema,
  orientationOf,
  type Candidates,
  type Manifest,
  type ManifestPhoto,
  type Selection,
} from '../shared/manifest.ts';
import { assetName, type Analysis } from './analyze.ts';
import { clusterNearDuplicates } from './dedupe.ts';
import { haversineKm } from './geo.ts';
import { APP_ROOT } from './paths.ts';
import { preselectPlace, scorePhotos, type ScorablePhoto } from './preselect.ts';
import { utcToLocal } from './time.ts';
import type { Timeline } from './timeline.ts';

const toPosix = (p: string): string => p.split(path.sep).join('/');
const relative = (file: string): string => toPosix(path.relative(APP_ROOT, file));

/** Construye el manifiesto con todas las fotos del viaje que se pudieron analizar. */
export function buildManifest(
  timeline: Timeline,
  analyses: ReadonlyMap<string, Analysis>,
  places: readonly Place[],
  config: AlbumConfig,
): Manifest {
  const tz = config.timeZone;
  const placeById = new Map(places.map((p) => [p.id, p]));
  const inTrip = timeline.photos.filter((p) => p.placeId !== null && analyses.has(p.item.id));

  // Ráfagas y casi duplicados, por lugar.
  const clusterOf = new Map<string, string>();
  const byPlace = new Map<string, typeof inTrip>();
  for (const p of inTrip) {
    const key = p.placeId ?? '';
    byPlace.set(key, [...(byPlace.get(key) ?? []), p]);
  }
  for (const group of byPlace.values()) {
    const clusters = clusterNearDuplicates(
      group.map((p) => ({ id: p.item.id, t: p.t, phash: analyses.get(p.item.id)?.phash ?? '' })),
    );
    for (const [id, cluster] of clusters) clusterOf.set(id, cluster);
  }

  const photos: ManifestPhoto[] = inTrip.map((p) => {
    const a = analyses.get(p.item.id);
    if (!a) throw new Error(`Falta el análisis de ${p.item.id}`);
    const name = assetName(p.item.id);
    const place = p.placeId ? placeById.get(p.placeId) : undefined;
    const distance = place && p.gps ? haversineKm(p.gps, place) : null;
    return {
      id: p.item.id,
      source: p.item.source,
      file: relative(p.item.master),
      related: p.item.related.map(relative),
      edited: p.item.edited,
      takenAt: new Date(p.t).toISOString(),
      localTime: utcToLocal(p.t, tz),
      gps: p.gps,
      placeId: p.placeId,
      distanceToPlaceKm: distance === null ? null : Math.round(distance * 100) / 100,
      inPlace: place !== undefined && distance !== null && distance <= place.radiusKm,
      width: a.width,
      height: a.height,
      orientation: orientationOf(a.width, a.height),
      megapixels: Math.round((a.width * a.height) / 1e5) / 10,
      quality: {
        sharpness: Math.round(a.sharpness),
        focus: Math.round(a.focus),
        exposureMean: Math.round(a.exposureMean * 10) / 10,
        clippedHigh: Math.round(a.clippedHigh * 1000) / 1000,
        clippedLow: Math.round(a.clippedLow * 1000) / 1000,
        phash: a.phash,
        blurry: a.focus < config.preselection.minFocus,
      },
      clusterId: clusterOf.get(p.item.id) ?? p.item.id,
      thumb: `/media/thumbs/${name}`,
      preview: `/media/preview/${name}`,
    };
  });

  return ManifestSchema.parse({
    version: 1,
    generatedAt: new Date().toISOString(),
    canonClockCorrectionSeconds: config.canonClockCorrectionSeconds,
    arrivals: timeline.arrivals.map((a) => ({
      placeId: a.placeId,
      takenAt: new Date(a.t).toISOString(),
      localTime: utcToLocal(a.t, tz),
      method: a.method,
    })),
    photos,
  });
}

/**
 * Aplica los ajustes manuales: quita y añade fotos a la sugerencia (y a las candidatas si hace falta).
 * Mantiene la sugerencia en `target` fotos: si un ajuste viejo deja huecos, se rellenan con las mejores
 * candidatas según `ranking`; si sobran, salen las peor clasificadas que no se añadieron a mano.
 * Ignora ids que no pertenecen al lugar, para que un ajuste viejo no rompa el proceso.
 */
export function applyCuration(
  entry: { candidates: string[]; suggested: string[] },
  placePhotos: ReadonlyMap<string, number>,
  adjust: { add: readonly string[]; remove: readonly string[] } | undefined,
  target: number,
  ranking: readonly string[],
): { candidates: string[]; suggested: string[]; ignored: string[] } {
  if (!adjust) return { ...entry, ignored: [] };
  const ignored = [...adjust.add, ...adjust.remove].filter((id) => !placePhotos.has(id));
  const byTime = (a: string, b: string): number =>
    (placePhotos.get(a) ?? 0) - (placePhotos.get(b) ?? 0);
  const rank = (id: string): number => {
    const i = ranking.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  const add = adjust.add.filter((id) => placePhotos.has(id));
  const candidates = [...new Set([...entry.candidates, ...add])].sort(byTime);
  const suggested = [
    ...new Set([...entry.suggested.filter((id) => !adjust.remove.includes(id)), ...add]),
  ];
  const spare = candidates
    .filter((id) => !suggested.includes(id) && !adjust.remove.includes(id))
    .sort((a, b) => rank(a) - rank(b));
  while (suggested.length < target && spare.length > 0) {
    const next = spare.shift();
    if (next !== undefined) suggested.push(next);
  }
  while (suggested.length > target) {
    const removable = suggested
      .filter((id) => !add.includes(id))
      .sort((a, b) => rank(b) - rank(a))[0];
    if (removable === undefined) break;
    suggested.splice(suggested.indexOf(removable), 1);
  }
  return { candidates, suggested: suggested.sort(byTime), ignored };
}

export function buildCandidates(
  manifest: Manifest,
  places: readonly Place[],
  config: AlbumConfig,
  curation: Curation = {},
): Candidates {
  return CandidatesSchema.parse({
    version: 1,
    generatedAt: new Date().toISOString(),
    selectedPerPlace: config.preselection.selectedPerPlace,
    places: places.map((place) => {
      const photos: ScorablePhoto[] = manifest.photos
        .filter((p) => p.placeId === place.id)
        .map((p) => ({
          id: p.id,
          t: Date.parse(p.takenAt),
          source: p.source,
          orientation: p.orientation,
          focus: p.quality.focus,
          exposureMean: p.quality.exposureMean,
          clippedHigh: p.quality.clippedHigh,
          clippedLow: p.quality.clippedLow,
          megapixels: p.megapixels,
          edited: p.edited,
          clusterId: p.clusterId,
          blurry: p.quality.blurry,
          inPlace: p.inPlace,
        }));
      const result = preselectPlace(photos, {
        candidates: config.preselection.candidatesPerPlace,
        suggested: config.preselection.selectedPerPlace,
      });
      const score = scorePhotos(photos);
      const curated = applyCuration(
        result,
        new Map(photos.map((p) => [p.id, p.t])),
        curation[place.id],
        config.preselection.selectedPerPlace,
        [...photos]
          .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0))
          .map((p) => p.id),
      );
      for (const id of curated.ignored) {
        console.warn(`  Ajuste manual ignorado en ${place.name}: ${id} no es de este lugar`);
      }
      return {
        placeId: place.id,
        total: photos.length,
        candidates: curated.candidates,
        suggested: curated.suggested,
      };
    }),
  });
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Escribe el manifiesto y las candidatas. La selección solo se crea si aún no existe: nunca pisa la tuya. */
export async function writeOutputs(
  dataDir: string,
  manifest: Manifest,
  candidates: Candidates,
): Promise<{ selectionCreated: boolean }> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(dataDir, 'candidates.json'), JSON.stringify(candidates, null, 2));
  const selectionFile = path.join(dataDir, 'selection.json');
  if (await exists(selectionFile)) return { selectionCreated: false };
  const selection: Selection = SelectionSchema.parse({
    version: 1,
    updatedAt: new Date().toISOString(),
    places: Object.fromEntries(candidates.places.map((p) => [p.placeId, p.suggested])),
  });
  await writeFile(selectionFile, JSON.stringify(selection, null, 2));
  return { selectionCreated: true };
}
