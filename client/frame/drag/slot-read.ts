// The page's side of the drop slots: thin readers that hand the real layout to the rules of
// `slots.ts`. Every box is in the frame's viewport pixels, as `getBoundingClientRect` answers.

import type { DragSource, FrameEntry } from '../../channel/structure-protocol.ts';
import {
  type Box,
  chooseSlot,
  type Flow,
  flowOf,
  type Hold,
  heldSearches,
  near,
  type Point,
  type Slot,
  type SlotChild,
  type SlotNode,
  type SlotSource,
} from './slots.ts';

const ATTRIBUTE = 'data-ks';
const MARKED = `[${ATTRIBUTE}]`;
const MAX_DEPTH = 200;
const MAX_CHILDREN = 500;

/** Where a drag that began with a press in the frame is held (`Hold` of `slots.ts`). */
export type Held = {
  /** The dragged element's own parent: the nearest marked element around it. */
  home: Element | null;
  /** The copy of the list item the dragged element is a part of. */
  bound: Element | null;
  /** `HOME_REACH` in frame pixels: how far outside its parent the drag still stays in it. */
  reach: number;
};

const idOf = (element: Element): string => element.getAttribute(ATTRIBUTE) ?? '';
const markedParent = (element: Element): Element | null =>
  element.parentElement?.closest(MARKED) ?? null;

function boxOf(element: Element): Box {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}

/** The marked elements right under `element`: wrappers without an id are looked through. */
function markedChildren(element: Element, found: Element[] = []): Element[] {
  for (const child of element.children) {
    if (found.length >= MAX_CHILDREN) break;
    if (child.hasAttribute(ATTRIBUTE)) found.push(child);
    else markedChildren(child, found);
  }
  return found;
}

/** `element` and the marked elements around it, itself first. */
function upFrom(element: Element | null): Element[] {
  const chain: Element[] = [];
  for (let at = element; at && chain.length < MAX_DEPTH; at = markedParent(at)) chain.push(at);
  return chain;
}

/** How `element` lays its children out, from its computed style. */
export function flowAt(view: Window, element: Element): Flow {
  const style = view.getComputedStyle(element);
  return flowOf({
    display: style.display,
    flexDirection: style.flexDirection,
    gridAutoFlow: style.gridAutoFlow,
    gridTemplateColumns: style.gridTemplateColumns,
    gridTemplateRows: style.gridTemplateRows,
    direction: style.direction,
  });
}

function nodeOf(view: Window, element: Element): SlotNode {
  const elements = markedChildren(element);
  const children: SlotChild[] = [];
  for (const child of elements) {
    const box = boxOf(child);
    // Hidden elements (`display: none`, also the editor's own hide) take no part in the layout.
    if (box.width > 0 || box.height > 0) children.push({ id: idOf(child), box });
  }
  return {
    id: idOf(element),
    box: boxOf(element),
    // A kit component may lay its children out in an inner element of its own.
    flow: flowAt(view, elements[0]?.parentElement ?? element),
    text: elements.length === 0 && (element.textContent ?? '').trim() !== '',
    children,
  };
}

/** The slot root around a dragged element does not change while it is dragged. */
const slotRoots = new WeakMap<DragSource, string | null>();

function slotRootOf(
  document: Document,
  id: string | undefined,
  entries: ReadonlyMap<string, FrameEntry>,
): string | null {
  if (id === undefined) return null;
  // The attribute is compared as text, so no id is ever written into a selector.
  for (const element of document.querySelectorAll(MARKED)) {
    if (idOf(element) !== id) continue;
    for (let at: Element | null = element; at; at = markedParent(at)) {
      if (entries.get(idOf(at))?.root === 'slot') return idOf(at);
    }
    return null;
  }
  return null;
}

function sourceOf(
  document: Document,
  source: DragSource,
  entries: ReadonlyMap<string, FrameEntry>,
): SlotSource {
  // What an inserted component is, only the server knows: it checks the drop again.
  if (source.kind === 'insert') return { dragged: new Set(), interactive: false, slot: null };
  let slot = slotRoots.get(source);
  if (slot === undefined) {
    slot = slotRootOf(document, source.ids[0], entries);
    slotRoots.set(source, slot);
  }
  return {
    dragged: new Set(source.ids),
    interactive: source.ids.some((id) => entries.get(id)?.interactive === true),
    slot,
  };
}

/**
 * The slot under `point` (frame CSS pixels) for `source`, or `null`. Never inside a dragged
 * element or its descendants, never between the children of a `mixed` parent, never inside an
 * element that does not `accept`, never an interactive element inside another, never next to an
 * element that is not `movable` because it sits in an expression. `held` keeps the slot in the
 * dragged element's own parent while the pointer is near it, and inside its list item
 * (`heldSearches`).
 */
export function slotAt(
  document: Document,
  point: Point,
  source: DragSource,
  entries: ReadonlyMap<string, FrameEntry>,
  held?: Held,
): Slot | null {
  const view = document.defaultView;
  if (!view) return null;
  let hit: Element | null = null;
  // The topmost first. The editor's overlays take no pointer events, so they are never in it.
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    hit = element.closest(MARKED);
    if (hit) break;
  }
  const parent = held?.home?.isConnected ? held.home : null;
  const hold: Hold<Element> = {
    home: parent ? upFrom(parent) : null,
    near: parent !== null && near(point, boxOf(parent), held?.reach ?? 0),
    bound: held?.bound ?? null,
  };
  const from = sourceOf(document, source, entries);
  /** Each element is read once, though two searches may share it. */
  const nodes = new Map<Element, SlotNode>();
  const nodeFor = (element: Element): SlotNode => {
    const known = nodes.get(element);
    if (known) return known;
    const node = nodeOf(view, element);
    nodes.set(element, node);
    return node;
  };
  for (const search of heldSearches(upFrom(hit), hold)) {
    const slot = chooseSlot(point, search.chain.map(nodeFor), from, entries, search.depth);
    if (slot) return slot;
  }
  return null;
}
