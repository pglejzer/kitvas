// A section too large for one script, cut into parts (plan 21, Review Focus 2). The cuts fall
// between layers, in their order, so a part only ever adds to frames that are made already: the
// section's own frame, its own layers, or a frame an earlier part made, which it finds by the mark
// that frame carries in its name until the close. Pure.

import type { TreeLayer, TreeSection } from '../tree.ts';
import { figmaVariableName, literal, normalizeSection, packedSection } from './pack.ts';

/** A part's own keys and brackets: `{"vars":[],"continues":[],"layers":[]}` and a little more. */
const PART_OVERHEAD = 48;
/** A stub in `continues` (`"a1499",`) and the parent numbers that point at it. */
const STUB_SIZE = 12;
/** Room for what a layer alone does not show: its mark, its image number, longer indexes. */
const LAYER_MARGIN = 24;

/** About the characters a layer takes in a part: its packed self, its variables' names, a margin. */
function layerSize(section: TreeSection, index: number): number {
  const layer = section.layers[index];
  if (layer === undefined) return 0;
  const alone = { ...section, layers: [{ ...layer, parent: -1 }] };
  const packed = packedSection(alone).layers[0];
  let names = 0;
  for (const name of Object.values(layer.bound)) {
    if (name !== undefined) names += figmaVariableName(name).length + 3;
  }
  return literal(packed ?? null).length + 1 + names + LAYER_MARGIN;
}

/** Layers `from` up to `to` of the whole section, after stubs of the frames they continue in. */
function partOf(whole: TreeSection, from: number, to: number): TreeSection {
  const own = whole.layers.slice(from, to);
  const earlier = new Set<number>();
  for (const layer of own) {
    if (layer.parent >= 0 && layer.parent < from) earlier.add(layer.parent);
  }
  const indexes = [...earlier].sort((a, b) => a - b);
  const stubs: TreeLayer[] = indexes.flatMap((index) => {
    const layer = whole.layers[index];
    return layer === undefined ? [] : [{ ...layer, parent: -2 - index }];
  });
  const stubAt = new Map(indexes.map((index, at) => [index, at]));
  const moved = own.map((layer) => {
    if (layer.parent < 0) return layer.parent === -1 ? layer : { ...layer, parent: -1 };
    const parent =
      layer.parent < from ? (stubAt.get(layer.parent) ?? -1) : layer.parent - from + stubs.length;
    return parent === layer.parent ? layer : { ...layer, parent };
  });
  return { id: whole.id, box: whole.box, layers: [...stubs, ...moved] };
}

/**
 * The section in parts whose packed layers each fit in `room` characters; one part when it fits
 * whole. A part that continues in a frame an earlier part made opens with a stub of it: a copy of
 * that layer whose `parent` is `-2 - <its index in the whole section>`. The other layers' parents
 * are indexes in the part, stubs first, or -1. A layer larger than `room` is a part of its own.
 */
export function splitSection(section: TreeSection, room: number): TreeSection[] {
  const whole = normalizeSection(section);
  const { layers } = whole;
  const sizes = layers.map((_layer, index) => layerSize(whole, index));
  const total = sizes.reduce((sum, size) => sum + size, PART_OVERHEAD);
  if (total <= room || layers.length < 2) return [whole];
  const cuts: number[] = [0];
  let start = 0;
  let used = PART_OVERHEAD;
  const opened = new Set<number>();
  layers.forEach((layer, index) => {
    const size = sizes[index] ?? 0;
    const stub = (): number =>
      layer.parent >= 0 && layer.parent < start && !opened.has(layer.parent) ? STUB_SIZE : 0;
    if (index > start && used + size + stub() > room) {
      cuts.push(index);
      start = index;
      used = PART_OVERHEAD;
      opened.clear();
    }
    used += size + stub();
    if (layer.parent >= 0 && layer.parent < start) opened.add(layer.parent);
  });
  cuts.push(layers.length);
  return cuts.slice(1).map((to, at) => partOf(whole, cuts[at] ?? 0, to));
}

/** A part's own layers: all but its stubs. */
export const ownLayers = (part: TreeSection): TreeLayer[] =>
  part.layers.filter((layer) => layer.parent >= -1);

/** The indexes in the whole section of the frames later parts continue in. */
export function continuedIn(parts: readonly TreeSection[]): Set<number> {
  const found = new Set<number>();
  for (const part of parts) {
    for (const layer of part.layers) if (layer.parent < -1) found.add(-layer.parent - 2);
  }
  return found;
}
