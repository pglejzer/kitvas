// Drop slots from the real layout (spec 4b, decision 11; plan 14, task C1). Pure geometry over
// boxes and computed styles, plus the indicator the frame draws for the slot under the pointer.
// A parent's axis comes from `display`, `flex-direction` (with `-reverse`), `flex-wrap` and
// `grid-auto-flow`; block flow is vertical.
//
// Every box, point, line and slot here is in the frame's viewport pixels: what
// `getBoundingClientRect` answers and what a pointer event's `clientX`, `clientY` are.
// `flowOf`, `slotFrom`, `chooseSlot` and `heldSearches` decide and touch no DOM; `slotAt`
// (`slot-read.ts`) only reads the page for them, and `createIndicator` only draws.

import type { FrameEntry, Place } from '../../../channel/structure-protocol.ts';

export type Box = { left: number; top: number; width: number; height: number };
export type Point = { x: number; y: number };

/**
 * A drop place and what the indicator draws: a line between two siblings (`before`, `after`) or
 * at an end of the parent (`first`, `last`), and the box of the element that takes the drop. A
 * drop into an empty parent has no line.
 */
export type Slot = {
  anchor: string;
  place: Place;
  line: { x: number; y: number; length: number; axis: 'x' | 'y' } | null;
  box: Box | null;
};

type Line = NonNullable<Slot['line']>;

/** The way a parent lays its children out: side by side (`row`) or one under another. */
export type Axis = 'row' | 'column';
/** `reverse`: the first child in the code is the last one along the axis. */
export type Flow = { axis: Axis; reverse: boolean };

/** The computed values the axis is read from. A missing one counts as the property's default. */
export type LayoutStyle = {
  display: string;
  flexDirection?: string;
  gridAutoFlow?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  direction?: string;
};

export type SlotChild = { id: string; box: Box };
export type SlotParent = {
  id: string;
  box: Box;
  axis: Axis;
  reverse?: boolean;
  /** The element children in the order of the code. */
  children: readonly SlotChild[];
};

/** One marked element on the way from the pointer up to the page's root. */
export type SlotNode = {
  id: string;
  box: Box;
  /** How its element children are laid out. */
  flow: Flow;
  /** It has no element children but text of its own. */
  text: boolean;
  children: readonly SlotChild[];
};

/** What the slot rules need to know of the dragged thing. */
export type SlotSource = {
  dragged: ReadonlySet<string>;
  interactive: boolean;
  /** The slot root the dragged element sits in: it may only move inside that one. */
  slot: string | null;
};

/** Near an element's edge the drop goes beside it, not into it: in pixels, at most a quarter. */
const EDGE = 8;
/** How far from an outer child's edge the line of a first or last place is drawn, at most. */
const INSET = 8;
/**
 * How far outside its own parent's box the pointer of a drag still finds its slot in that parent,
 * in pixels on the screen (the caller multiplies by the canvas scale).
 */
export const HOME_REACH = 32;

/** How many tracks a computed `grid-template-columns` or `-rows` value lists. */
export function trackCount(value: string): number {
  // Line names are no tracks; a function such as `minmax(10px, 1fr)` is one.
  const tracks = value.replace(/\[[^\]]*\]/g, ' ').trim();
  if (tracks === '' || tracks === 'none') return 0;
  let depth = 0;
  let count = 0;
  let inside = false;
  for (const char of tracks) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && /\s/.test(char)) {
      inside = false;
    } else if (!inside) {
      inside = true;
      count += 1;
    }
  }
  return count;
}

/**
 * The axis a parent's children follow. Flex: its direction. Grid: across when the items fill
 * rows of several columns or flow by column into one row, else down. Anything else is block flow.
 * In a right-to-left parent a row runs the other way.
 */
export function flowOf(style: LayoutStyle): Flow {
  const rtl = style.direction === 'rtl';
  if (style.display.includes('flex')) {
    const direction = style.flexDirection ?? 'row';
    const reverse = direction.endsWith('-reverse');
    if (direction.startsWith('column')) return { axis: 'column', reverse };
    return { axis: 'row', reverse: reverse !== rtl };
  }
  if (style.display.includes('grid')) {
    const byColumn = (style.gridAutoFlow ?? 'row').includes('column');
    const tracks = byColumn ? style.gridTemplateRows : style.gridTemplateColumns;
    const wraps = trackCount(tracks ?? '') > 1;
    const axis: Axis = byColumn === wraps ? 'column' : 'row';
    return { axis, reverse: axis === 'row' && rtl };
  }
  return { axis: 'column', reverse: false };
}

type Span = { start: number; end: number };

const spanOf = (box: Box, axis: Axis): Span =>
  axis === 'row'
    ? { start: box.left, end: box.left + box.width }
    : { start: box.top, end: box.top + box.height };
const other = (axis: Axis): Axis => (axis === 'row' ? 'column' : 'row');
const along = (point: Point, axis: Axis): number => (axis === 'row' ? point.x : point.y);
const overlap = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;
const sameBox = (a: Box, b: Box): boolean =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

/** How far `point` is from `box`; 0 inside it. */
export function distance(point: Point, box: Box): number {
  const dx = Math.max(box.left - point.x, 0, point.x - (box.left + box.width));
  const dy = Math.max(box.top - point.y, 0, point.y - (box.top + box.height));
  return Math.hypot(dx, dy);
}

/**
 * The line at one side of `child`: half way to the neighbour on the same line of the layout, or
 * a little outside the child when it is the outermost one there.
 */
function lineAt(parent: SlotParent, child: SlotChild, atStart: boolean): Line {
  const main = spanOf(child.box, parent.axis);
  const cross = spanOf(child.box, other(parent.axis));
  const edge = atStart ? main.start : main.end;
  let neighbour: number | undefined;
  for (const sibling of parent.children) {
    if (sibling.id === child.id && sameBox(sibling.box, child.box)) continue;
    if (!overlap(spanOf(sibling.box, other(parent.axis)), cross)) continue;
    const span = spanOf(sibling.box, parent.axis);
    if (atStart && span.end <= main.start + 0.5) {
      neighbour = Math.max(neighbour ?? span.end, span.end);
    }
    if (!atStart && span.start >= main.end - 0.5) {
      neighbour = Math.min(neighbour ?? span.start, span.start);
    }
  }
  let at = edge;
  if (neighbour !== undefined) {
    at = (edge + neighbour) / 2;
  } else {
    const outer = spanOf(parent.box, parent.axis);
    const room = atStart ? edge - outer.start : outer.end - edge;
    const inset = Math.min(Math.max(room, 0) / 2, INSET);
    at = atStart ? edge - inset : edge + inset;
  }
  const length = cross.end - cross.start;
  return parent.axis === 'row'
    ? { x: at, y: cross.start, length, axis: 'y' }
    : { x: cross.start, y: at, length, axis: 'x' };
}

function beside(parent: SlotParent, child: SlotChild, place: 'before' | 'after'): Slot {
  const atStart = (place === 'before') !== (parent.reverse === true);
  return { anchor: child.id, place, line: lineAt(parent, child, atStart), box: parent.box };
}

/**
 * The slot among a parent's children, by geometry alone. An empty parent takes the drop as its
 * `last` child. Otherwise the nearest child decides: the pointer's half of it along the axis
 * gives `before` or `after` (swapped in a reversed flow), and past the outer edge of the first or
 * the last child (the parent's padding) it is `first` or `last`. With `inside` false the parent
 * offers no place of its own: only `before` and `after`, and nothing when it is empty.
 */
export function slotFrom(point: Point, parent: SlotParent, inside = true): Slot | null {
  const { children } = parent;
  const reverse = parent.reverse === true;
  let nearest: SlotChild | undefined;
  let index = -1;
  let best = Number.POSITIVE_INFINITY;
  for (const [at, child] of children.entries()) {
    const far = distance(point, child.box);
    if (far < best) {
      best = far;
      nearest = child;
      index = at;
    }
  }
  if (!nearest) {
    return inside ? { anchor: parent.id, place: 'last', line: null, box: parent.box } : null;
  }
  const span = spanOf(nearest.box, parent.axis);
  const at = along(point, parent.axis);
  if (inside) {
    // What comes first in the code is at the end of a reversed flow.
    const pastFirst = reverse ? at > span.end : at < span.start;
    const pastLast = reverse ? at < span.start : at > span.end;
    if (index === 0 && pastFirst) {
      const line = lineAt(parent, nearest, !reverse);
      return { anchor: parent.id, place: 'first', line, box: parent.box };
    }
    if (index === children.length - 1 && pastLast) {
      const line = lineAt(parent, nearest, reverse);
      return { anchor: parent.id, place: 'last', line, box: parent.box };
    }
  }
  const early = at < (span.start + span.end) / 2;
  return beside(parent, nearest, early !== reverse ? 'before' : 'after');
}

/** `before` or `after` when the pointer is in the thin band at an end of `box`, else `null`. */
function edgeOf(point: Point, box: Box, flow: Flow): 'before' | 'after' | null {
  const span = spanOf(box, flow.axis);
  const band = Math.min(EDGE, (span.end - span.start) / 4);
  const at = along(point, flow.axis);
  if (at < span.start + band) return flow.reverse ? 'after' : 'before';
  if (at > span.end - band) return flow.reverse ? 'before' : 'after';
  return null;
}

function halfOf(point: Point, box: Box, flow: Flow): 'before' | 'after' {
  const span = spanOf(box, flow.axis);
  return along(point, flow.axis) < (span.start + span.end) / 2 !== flow.reverse
    ? 'before'
    : 'after';
}

/**
 * The slot for a pointer over `chain`: the deepest marked element under it first, then each
 * marked ancestor. The deepest place the rules allow wins:
 * - nothing at or below a dragged element, and never a dragged element as the anchor;
 * - beside an element only when it is `movable` (not in an expression, no root) and its parent
 *   does not mix text and elements;
 * - inside an element only when it `accepts`; when it has no element children it must also have
 *   no text of its own (a drop there would make it mixed);
 * - an interactive source never under an interactive element;
 * - nothing into or out of a slot: the nearest slot root around the place is the source's own.
 * Near an element's edge the drop goes beside it, so two boxes that touch still have a slot
 * between them; elsewhere on a container it goes inside.
 * `depth`: only the first `depth` elements of the chain may take the drop (`heldSearches`); the
 * ones after them still say what stands around a place.
 */
export function chooseSlot(
  point: Point,
  chain: readonly SlotNode[],
  source: SlotSource,
  entries: ReadonlyMap<string, FrameEntry>,
  depth: number = chain.length,
): Slot | null {
  const anchors = (id: string): boolean =>
    entries.get(id)?.movable === true && !source.dragged.has(id);

  /** `chain[index]` may get a child from the source, at any place. */
  const hosts = (index: number): boolean => {
    const entry = entries.get(chain[index]?.id ?? '');
    if (!entry || entry.mixed) return false;
    let slot: string | null = null;
    for (const node of chain.slice(index)) {
      const around = entries.get(node.id);
      if (!around) continue;
      if (source.interactive && around.interactive) return false;
      if (slot === null && around.root === 'slot') slot = around.id;
    }
    return slot === source.slot;
  };

  const asParent = (node: SlotNode): SlotParent => ({
    id: node.id,
    box: node.box,
    axis: node.flow.axis,
    reverse: node.flow.reverse,
    children: node.children.filter((child) => !source.dragged.has(child.id)),
  });

  const within = (index: number, node: SlotNode): Slot | null => {
    const entry = entries.get(node.id);
    if (!entry?.accepts || !hosts(index)) return null;
    // An element written in an expression is no drop target, though its children can be anchors.
    const open = entry.movable || entry.root !== null;
    const parent = asParent(node);
    if (parent.children.length === 0 && node.text) return null;
    const slot = slotFrom(point, parent, open);
    if (!slot || slot.anchor === node.id) return slot;
    return anchors(slot.anchor) ? slot : null;
  };

  let start = 0;
  for (const [index, node] of chain.entries()) {
    if (source.dragged.has(node.id)) start = index + 1;
  }
  for (let index = start; index < Math.min(depth, chain.length); index += 1) {
    const node = chain[index];
    if (!node) continue;
    const parent = index + 1 < depth ? chain[index + 1] : undefined;
    const next = parent && anchors(node.id) && hosts(index + 1) ? parent : undefined;
    const edge = next ? edgeOf(point, node.box, next.flow) : null;
    if (next && edge) return beside(asParent(next), node, edge);
    const inner = within(index, node);
    if (inner) return inner;
    if (next) return beside(asParent(next), node, halfOf(point, node.box, next.flow));
  }
  return null;
}

/** `point` is inside `box`, or at most `reach` outside it. */
export function near(point: Point, box: Box, reach: number): boolean {
  return distance(point, box) <= reach;
}

/**
 * Where a drag of an element is held (ADR 0066); `T` is an element, or a plain value in a test.
 * `home`: the dragged element's own parent and the marked elements around that, the parent
 * first; `null` for a drag with no parent on the page (an insert). `near`: the pointer is inside
 * that parent's box or within `HOME_REACH` outside it. `bound`: the copy of the list item the
 * dragged element is a part of; `null` outside any list.
 */
export type Hold<T> = { home: readonly T[] | null; near: boolean; bound: T | null };

/** A chain to look for a slot in, and how many of its first elements may take the drop. */
export type Search<T> = { chain: readonly T[]; depth: number };

/**
 * Where a held drag looks for its slot, in order; the first search that gives one wins. `chain`:
 * the marked elements from the one under the pointer outwards.
 * - Near its own parent the slot stays in that parent: the chain up to it, or the parent alone
 *   when the pointer is outside its box. So a drop a few pixels past a container's edge is still a
 *   drop into it, and a container is left only on purpose.
 * - Else, and when that parent gives no slot, the chain as it is. A part of a list item never
 *   leaves its item: the chain ends at `bound`, and there is no search outside it.
 */
export function heldSearches<T>(chain: readonly T[], hold: Hold<T>): Search<T>[] {
  const searches: Search<T>[] = [];
  const parent = hold.home?.[0];
  if (hold.home !== null && parent !== undefined && hold.near) {
    const at = chain.indexOf(parent);
    searches.push(at < 0 ? { chain: hold.home, depth: 1 } : { chain, depth: at + 1 });
  }
  if (hold.bound === null) {
    searches.push({ chain, depth: chain.length });
  } else {
    const at = chain.indexOf(hold.bound);
    if (at >= 0) searches.push({ chain, depth: at + 1 });
  }
  return searches;
}

export { createIndicator, type Indicator, placeIndicator } from '../../edit/indicator.ts';
