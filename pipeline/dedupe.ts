import { hammingHex } from './quality.ts';

/**
 * Agrupa ráfagas y casi duplicados: fotos con pHash parecido tomadas con pocos minutos de diferencia.
 * Devuelve el grupo de cada foto (el id de su primer miembro).
 */
export function clusterNearDuplicates(
  items: readonly { id: string; t: number; phash: string }[],
  // 16 bits: dos tomas de la misma escena con un ligero reencuadre dan 12–18; fotos sin relación, 32 ± 4.
  options = { maxHamming: 16, maxGapMs: 3 * 60_000 },
): Map<string, string> {
  const sorted = [...items].sort((a, b) => a.t - b.t);
  const parent = new Map<string, string>(sorted.map((i) => [i.id, i.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    // Compresión de caminos.
    let node = id;
    while (node !== root) {
      const next = parent.get(node) ?? root;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    if (!a) continue;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (!b || b.t - a.t > options.maxGapMs) break;
      if (hammingHex(a.phash, b.phash) <= options.maxHamming) {
        const ra = find(a.id);
        const rb = find(b.id);
        if (ra !== rb) parent.set(rb, ra);
      }
    }
  }
  return new Map(sorted.map((i) => [i.id, find(i.id)]));
}
