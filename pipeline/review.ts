import sharp, { type OverlayOptions } from 'sharp';

/** Hojas de contacto para revisar a simple vista la preselección de cada lugar. */

export interface SheetTile {
  thumb: string;
  label: string;
  /** Marcada como sugerida para el álbum. */
  star: boolean;
}

const CELL_W = 320;
const CELL_H = 240;
const LABEL_H = 26;
const TITLE_H = 48;
const GAP = 8;

const escapeXml = (s: string): string =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );

export async function buildContactSheet(
  title: string,
  tiles: readonly SheetTile[],
  out: string,
  cols = 5,
): Promise<void> {
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  const width = cols * CELL_W + (cols + 1) * GAP;
  const height = TITLE_H + rows * (CELL_H + LABEL_H + GAP) + GAP;

  const composites: OverlayOptions[] = [
    {
      input: Buffer.from(
        `<svg width="${String(width)}" height="${String(TITLE_H)}"><text x="${String(GAP)}" y="32" font-family="Segoe UI, Arial" font-size="24" fill="#2a2622">${escapeXml(title)}</text></svg>`,
      ),
      left: 0,
      top: 0,
    },
  ];

  await Promise.all(
    tiles.map(async (tile, i) => {
      const left = GAP + (i % cols) * (CELL_W + GAP);
      const top = TITLE_H + Math.floor(i / cols) * (CELL_H + LABEL_H + GAP);
      const image = await sharp(tile.thumb)
        .resize(CELL_W, CELL_H, { fit: 'contain', background: '#e9e4da' })
        .toBuffer();
      const color = tile.star ? '#9a6a24' : '#4a443d';
      const label = Buffer.from(
        `<svg width="${String(CELL_W)}" height="${String(LABEL_H)}"><rect width="100%" height="100%" fill="${tile.star ? '#f6e7c4' : '#f7f4ee'}"/><text x="6" y="18" font-family="Segoe UI, Arial" font-size="14" fill="${color}">${escapeXml(`${tile.star ? '★ ' : ''}${tile.label}`)}</text></svg>`,
      );
      composites.push({ input: image, left, top }, { input: label, left, top: top + CELL_H });
    }),
  );

  await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite(composites)
    .jpeg({ quality: 80 })
    .toFile(out);
}
