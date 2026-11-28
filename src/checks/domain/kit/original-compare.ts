// Compares the layer walk of a copy with the walk of its original (`kit verify`, step `original`,
// ADR 0093). Pure. Only what a person would call a different look is compared: sizes, paints,
// spacing and type. Tags, element ids and vector markup never are.

import type { LayerFacts, LayerNode, PlacedRead } from '../page/layers.ts';

/** px: width, height, left and top inside the root. */
export const BOX_TOLERANCE = 0.5;
/** Every other number. */
export const VALUE_TOLERANCE = 0.01;
/** Findings kept for one frame. */
export const DIFFS_MAX = 20;

export type OriginalDiff = { element: string; property: string; copy: string; original: string };

/** A value read from a node: numbers are compared with a tolerance, text exactly. */
type Part = number | string;
type Property = {
  name: string;
  /** `box`: the numbers are compared to half a pixel and printed as lengths. */
  kind: 'box' | 'length' | 'plain';
  read(node: LayerNode, origin: [number, number]): Part[];
};

const NONE: Part[] = ['none'];

const paintText = (node: LayerNode): Part[] =>
  node.paints.length === 0
    ? NONE
    : node.paints.map((paint) => {
        if (paint.kind === 'solid') return paint.colour;
        if (paint.kind === 'linear') {
          const stops = paint.stops.map((stop) => `${stop.colour} ${stop.at}`).join(', ');
          return `linear(${paint.angle}deg, ${stops})`;
        }
        return `image(${paint.src} ${paint.fit})`;
      });

const shadowText = (node: LayerNode): Part[] =>
  node.shadows.length === 0
    ? NONE
    : node.shadows.flatMap((shadow) => [
        ...(shadow.inset ? ['inset'] : []),
        shadow.x,
        shadow.y,
        shadow.blur,
        shadow.spread,
        shadow.colour,
      ]);

/** What a text node holds, or `none` for a frame. */
const ofText = (node: LayerNode, pick: (text: NonNullable<LayerNode['text']>) => Part): Part[] =>
  node.text ? [pick(node.text)] : NONE;

/** What a node's flow holds, or `none` for a node placed by its boxes. */
const ofFlow = (node: LayerNode, pick: (flow: NonNullable<LayerNode['flow']>) => Part[]): Part[] =>
  node.flow ? pick(node.flow) : NONE;

/** The properties of C7, in the order their findings are listed. */
const PROPERTIES: Property[] = [
  { name: 'width', kind: 'box', read: (node) => [node.box[2]] },
  { name: 'height', kind: 'box', read: (node) => [node.box[3]] },
  { name: 'left', kind: 'box', read: (node, origin) => [node.box[0] - origin[0]] },
  { name: 'top', kind: 'box', read: (node, origin) => [node.box[1] - origin[1]] },
  { name: 'background', kind: 'plain', read: paintText },
  {
    name: 'border-width',
    kind: 'length',
    read: (node) => (node.border ? node.border.widths : NONE),
  },
  { name: 'border-color', kind: 'plain', read: (node) => [node.border?.colour ?? 'none'] },
  { name: 'border-radius', kind: 'length', read: (node) => node.radius },
  { name: 'box-shadow', kind: 'length', read: shadowText },
  { name: 'opacity', kind: 'plain', read: (node) => [node.opacity] },
  { name: 'overflow', kind: 'plain', read: (node) => [node.clips ? 'clip' : 'visible'] },
  { name: 'flex-direction', kind: 'plain', read: (node) => ofFlow(node, (f) => [f.direction]) },
  {
    name: 'flex-wrap',
    kind: 'plain',
    read: (node) => ofFlow(node, (f) => [f.wrap ? 'wrap' : 'nowrap']),
  },
  { name: 'gap', kind: 'length', read: (node) => ofFlow(node, (f) => [f.gap, f.crossGap]) },
  { name: 'padding', kind: 'length', read: (node) => ofFlow(node, (f) => f.padding) },
  { name: 'justify-content', kind: 'plain', read: (node) => ofFlow(node, (f) => [f.justify]) },
  { name: 'align-items', kind: 'plain', read: (node) => ofFlow(node, (f) => [f.align]) },
  { name: 'text', kind: 'plain', read: (node) => ofText(node, (text) => text.characters) },
  { name: 'font-family', kind: 'plain', read: (node) => ofText(node, (text) => text.family) },
  { name: 'font-weight', kind: 'plain', read: (node) => ofText(node, (text) => text.weight) },
  {
    name: 'font-style',
    kind: 'plain',
    read: (node) => ofText(node, (text) => (text.italic ? 'italic' : 'normal')),
  },
  { name: 'font-size', kind: 'length', read: (node) => ofText(node, (text) => text.size) },
  {
    name: 'line-height',
    kind: 'length',
    read: (node) => ofText(node, (text) => text.lineHeight),
  },
  {
    name: 'letter-spacing',
    kind: 'length',
    read: (node) => ofText(node, (text) => text.letterSpacing),
  },
  { name: 'text-align', kind: 'plain', read: (node) => ofText(node, (text) => text.align) },
  { name: 'text-transform', kind: 'plain', read: (node) => ofText(node, (text) => text.transform) },
  { name: 'color', kind: 'plain', read: (node) => ofText(node, (text) => text.colour) },
];

const round = (value: number): number => Math.round(value * 100) / 100;

function print(parts: Part[], kind: Property['kind']): string {
  return parts
    .map((part) =>
      typeof part === 'number' ? `${round(part)}${kind === 'plain' ? '' : 'px'}` : part,
    )
    .join(' ');
}

function same(a: Part[], b: Part[], tolerance: number): boolean {
  if (a.length !== b.length) return false;
  return a.every((part, at) => {
    const other = b[at];
    if (typeof part === 'number' && typeof other === 'number') {
      return Math.abs(part - other) <= tolerance;
    }
    return part === other;
  });
}

/** `button > span[2]`: the tags from the root, with the place among siblings from the second on. */
function pathOf(facts: LayerFacts, index: number): string {
  const names: string[] = [];
  for (let at = index; at >= 0; at = facts.nodes[at]?.parent ?? -1) {
    const node = facts.nodes[at];
    if (!node) break;
    let place = 1;
    for (let before = 0; before < at; before += 1) {
      if (facts.nodes[before]?.parent === node.parent) place += 1;
    }
    names.unshift(place > 1 ? `${node.tag}[${place}]` : node.tag);
  }
  return names.join(' > ') || 'root';
}

function describe(facts: LayerFacts, index: number): string {
  const node = facts.nodes[index];
  if (!node) return 'none';
  const parent = node.parent < 0 ? 'root' : pathOf(facts, node.parent);
  return `${node.kind} ${node.tag} in ${parent}`;
}

/**
 * Pairs the nodes in walk order and lists each property that differs, in the order of the node and
 * then of C7. The pairing stops at the first pair whose kind or parent differs, or where one side
 * ends: that place is one `structure` finding and nothing after it is compared.
 */
export function compareLayers(
  copy: LayerFacts,
  original: LayerFacts,
): { diffs: OriginalDiff[]; more: number } {
  const all: OriginalDiff[] = [];
  const paired = Math.min(copy.nodes.length, original.nodes.length);
  const copyOrigin: [number, number] = [copy.nodes[0]?.box[0] ?? 0, copy.nodes[0]?.box[1] ?? 0];
  const originalOrigin: [number, number] = [
    original.nodes[0]?.box[0] ?? 0,
    original.nodes[0]?.box[1] ?? 0,
  ];
  let stopped = false;
  for (let index = 0; index < paired; index += 1) {
    const a = copy.nodes[index];
    const b = original.nodes[index];
    if (!a || !b) break;
    if (a.kind !== b.kind || a.parent !== b.parent) {
      all.push({
        element: pathOf(copy, index),
        property: 'structure',
        copy: describe(copy, index),
        original: describe(original, index),
      });
      stopped = true;
      break;
    }
    const element = pathOf(copy, index);
    for (const property of PROPERTIES) {
      const left = property.read(a, copyOrigin);
      const right = property.read(b, originalOrigin);
      const tolerance = property.kind === 'box' ? BOX_TOLERANCE : VALUE_TOLERANCE;
      if (same(left, right, tolerance)) continue;
      all.push({
        element,
        property: property.name,
        copy: print(left, property.kind),
        original: print(right, property.kind),
      });
    }
  }
  if (!stopped && copy.nodes.length !== original.nodes.length) {
    const side = copy.nodes.length > original.nodes.length ? copy : original;
    all.push({
      element: pathOf(side, paired),
      property: 'structure',
      copy: describe(copy, paired),
      original: describe(original, paired),
    });
  }
  return { diffs: all.slice(0, DIFFS_MAX), more: Math.max(0, all.length - DIFFS_MAX) };
}

/** Outlines paired by place: one only on one side, or another value, is one finding. */
export function compareOutlines(copy: PlacedRead[], original: PlacedRead[]): OriginalDiff[] {
  const diffs: OriginalDiff[] = [];
  const theirs = new Map(original.map((read) => [read.place, read]));
  const seen = new Set<string>();
  for (const mine of copy) {
    seen.add(mine.place);
    const other = theirs.get(mine.place);
    if (other?.value === mine.value) continue;
    diffs.push({
      element: mine.element,
      property: 'outline',
      copy: mine.value,
      original: other?.value ?? 'none',
    });
  }
  for (const other of original) {
    if (seen.has(other.place)) continue;
    diffs.push({
      element: other.element,
      property: 'outline',
      copy: 'none',
      original: other.value,
    });
  }
  return diffs;
}

/**
 * The display of each component root of the original against the copy's element at its place (W37).
 * A place the copy lacks is the layer walk's `structure` finding.
 */
export function compareHosts(copy: PlacedRead[], original: PlacedRead[]): OriginalDiff[] {
  const mine = new Map(copy.map((read) => [read.place, read]));
  return original.flatMap((other) => {
    const read = mine.get(other.place);
    if (read === undefined || read.value === other.value) return [];
    return [
      { element: read.element, property: 'display', copy: read.value, original: other.value },
    ];
  });
}
