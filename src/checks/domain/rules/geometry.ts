// What the layout and look rules share: children, ancestors, frames, bands and rows of boxes.

import { UI_NESTED_FRAME } from '../guidelines/ui-layout.ts';
import type { FactNode, PageFacts } from '../page/facts.ts';
import { parseColour } from './colour.ts';

const FRAME = UI_NESTED_FRAME.thresholds;
const WHITE = '#ffffffff';
const CONTROL_TAGS = new Set(['input', 'select', 'textarea', 'button']);

export const MEDIA_TAGS: ReadonlySet<string> = new Set([
  'img',
  'svg',
  'video',
  'picture',
  'canvas',
]);

/** A form control or an action: a card is never one of these. */
export function isControl(node: FactNode): boolean {
  return node.field !== null || node.action !== null || CONTROL_TAGS.has(node.tag);
}

const SCROLLS = new Set(['auto', 'scroll']);

/**
 * The node's box lies partly outside an ancestor that scrolls (`overflow` auto or scroll) on that
 * axis, by more than 1 px: a person scrolls to it, so the page edge and the ground behind it do
 * not decide how it reads.
 */
export function cutByScroller(facts: PageFacts, index: number): boolean {
  const box = facts.nodes[index]?.box;
  if (!box) return false;
  return ancestorsOf(facts, index).some((position) => {
    const scroller = facts.nodes[position];
    if (!scroller) return false;
    const [x, y, width, height] = scroller.box;
    const sideways =
      SCROLLS.has(scroller.style.overflowX) && (box[0] < x - 1 || box[0] + box[2] > x + width + 1);
    const down =
      SCROLLS.has(scroller.style.overflowY) && (box[1] < y - 1 || box[1] + box[3] > y + height + 1);
    return sideways || down;
  });
}

/** Visible children of every node, in document order. */
export function childrenOf(facts: PageFacts): number[][] {
  const kids: number[][] = facts.nodes.map(() => []);
  facts.nodes.forEach((node, index) => {
    if (!node.hidden && node.parent >= 0) kids[node.parent]?.push(index);
  });
  return kids;
}

/** The parent chain of a node, nearest first. */
export function ancestorsOf(facts: PageFacts, index: number): number[] {
  const chain: number[] = [];
  let at = facts.nodes[index]?.parent ?? -1;
  while (at >= 0 && chain.length < facts.nodes.length) {
    chain.push(at);
    at = facts.nodes[at]?.parent ?? -1;
  }
  return chain;
}

/** Per node: it or a visible descendant satisfies `own`. */
export function subtreeHas(facts: PageFacts, own: (node: FactNode) => boolean): boolean[] {
  const flags = facts.nodes.map((node) => !node.hidden && own(node));
  for (let index = facts.nodes.length - 1; index >= 0; index -= 1) {
    const parent = facts.nodes[index]?.parent ?? -1;
    if (flags[index] && parent >= 0) flags[parent] = true;
  }
  return flags;
}

/** Visible text blocks. */
export function textNodes(facts: PageFacts): number[] {
  const found: number[] = [];
  facts.nodes.forEach((node, index) => {
    if (!node.hidden && node.text !== null) found.push(index);
  });
  return found;
}

export type Cues = { border: boolean; shadow: boolean; fill: boolean };

/** The visible cues of a node big enough to be a frame; null for a control, a hidden or a small node. */
export function cuesOf(facts: PageFacts, index: number): Cues | null {
  const node = facts.nodes[index];
  if (!node || node.hidden || isControl(node)) return null;
  if (node.box[2] < FRAME.frameMinWidth || node.box[3] < FRAME.frameMinHeight) return null;
  const above = (node.parent >= 0 ? facts.nodes[node.parent]?.style.ground : undefined) ?? WHITE;
  const background = parseColour(node.style.background);
  return {
    // A box needs a border on all four sides; one side is a divider, not a frame.
    border: node.style.border.every((width) => width > 0),
    shadow: node.style.shadow !== '',
    fill: background !== null && background.a > 0 && node.style.ground !== above,
  };
}

/**
 * The cues of a frame: a node with a border, a shadow or its own fill. A band is not a frame: a
 * wide node with only a fill, or any node that runs from edge to edge of the page (a header bar,
 * a full-bleed section).
 */
export function frameOf(facts: PageFacts, index: number): Cues | null {
  const cues = cuesOf(facts, index);
  const node = facts.nodes[index];
  if (!cues || !node) return null;
  if (!cues.border && !cues.shadow && !cues.fill) return null;
  const width = facts.viewport[0];
  const wide = node.box[2] >= FRAME.bandShare * width;
  const edgeToEdge =
    node.box[0] <= FRAME.edgeTolerance && node.box[0] + node.box[2] >= width - FRAME.edgeTolerance;
  const band = edgeToEdge || (wide && !cues.border && !cues.shadow);
  return band ? null : cues;
}

/** Visible frames grouped by parent, each group in rows (tops within `tolerance`), each row left to right. */
export function frameRows(
  facts: PageFacts,
  tolerance: number,
): { parent: number; rows: number[][] }[] {
  const byParent = new Map<number, number[]>();
  facts.nodes.forEach((node, index) => {
    if (frameOf(facts, index) === null) return;
    const list = byParent.get(node.parent) ?? [];
    list.push(index);
    byParent.set(node.parent, list);
  });
  const groups: { parent: number; rows: number[][] }[] = [];
  for (const [parent, members] of byParent) {
    const box = (index: number): FactNode['box'] => facts.nodes[index]?.box ?? [0, 0, 0, 0];
    const sorted = [...members].sort((a, b) => box(a)[1] - box(b)[1] || box(a)[0] - box(b)[0]);
    const rows: number[][] = [];
    let rowTop = Number.NEGATIVE_INFINITY;
    for (const index of sorted) {
      const top = box(index)[1];
      const row = rows[rows.length - 1];
      if (row && top - rowTop <= tolerance) row.push(index);
      else {
        rows.push([index]);
        rowTop = top;
      }
    }
    for (const row of rows) row.sort((a, b) => box(a)[0] - box(b)[0]);
    groups.push({ parent, rows });
  }
  return groups;
}
