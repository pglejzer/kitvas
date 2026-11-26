// The page's side of a drag: thin readers of the frame's DOM for the rules of `session.ts`,
// `rect.ts` and `item-slots.ts`. Nothing here decides anything. Boxes are the frame's viewport
// pixels, and an id is always compared as text, never written into a selector.

import { type CopyRef, parseEditFrame } from '../../channel/edit-protocol.ts';
import type { FrameEntry } from '../../channel/structure-protocol.ts';
import { copyOf, copyPath, PAGE, type PathReader } from '../edit/items.ts';
import { elementsWith } from '../edit/tree.ts';
import { boxOf, type RectItem } from '../page/rect.ts';
import type { Family } from './session.ts';
import { type ItemList, listsOf, type OwnPlace } from './slots/item-slots.ts';
import { flowAt } from './slots/slot-read.ts';
import { distance, type Point } from './slots/slots.ts';

const MARKED = '[data-ks]';
/** The most copies of a list item a dropped part of its template is moved in before the build. */
const MAX_DROP_COPIES = 200;

/** The nearest marked element around `element`. */
export const around = (element: Element): Element | null =>
  element.parentElement?.closest(MARKED) ?? null;
export const idAt = (element: Element): string => element.getAttribute('data-ks') ?? '';

/** The protocol's own check: one odd id would make the studio refuse the whole message. */
const accepted = (id: string): boolean =>
  parseEditFrame({ type: 'hovered', id }, 'probe') !== undefined;

/** The first element of each id, in document order: the copies of a mapped list share one. */
export function firstOf(ids: readonly string[]): Element[] {
  const seen = new Set<string>();
  return elementsWith(new Set(ids)).filter((element) => {
    const id = idAt(element);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** The marked elements around the pressed one, itself first. */
export function chainOf(target: Element): Element[] {
  const chain: Element[] = [];
  for (let at = target.closest(MARKED); at; at = around(at)) chain.push(at);
  return chain;
}

/** The marked elements right inside `parent` (`null`: at the top of the page). */
function childrenOf(parent: Element | null): Element[] {
  const inside = (parent ?? document.body).querySelectorAll(MARKED);
  return [...inside].filter((child) => around(child) === parent);
}

/** The nearest marked element around the element, and the marked elements right inside that. */
export function familyOf(id: string): Family {
  const element = firstOf([id])[0];
  if (!element) return { parent: null, row: [] };
  const parent = around(element);
  const row = new Set(childrenOf(parent).map(idAt));
  return { parent: parent ? idAt(parent) : null, row: [...row] };
}

/**
 * The elements a drag of `ids` moves: the pressed copy (`pressed`: the marked elements around the
 * press, the nearest first) and, for a run of siblings, the others in the same parent. Without a
 * press (a drag from the page) the first element of each id.
 */
export function draggedOf(ids: readonly string[], pressed: readonly Element[]): Element[] {
  const grabbed = pressed.find((element) => ids.includes(idAt(element)));
  if (!grabbed) return firstOf(ids);
  if (ids.length === 1) return [grabbed];
  const row = childrenOf(around(grabbed));
  const found: Element[] = [];
  for (const id of ids) {
    const element = idAt(grabbed) === id ? grabbed : row.find((child) => idAt(child) === id);
    if (element) found.push(element);
  }
  return found;
}

/**
 * Where the drag of `element` is held (`Hold` of `slots.ts`): its own parent, and the copy of the
 * list item it is a part of.
 */
export function holdOf(
  element: Element,
  entry: FrameEntry | undefined,
): { home: Element | null; bound: Element | null } {
  const id = idAt(element);
  // The innermost list the element is a part of, never one it is the root of itself.
  const root = (entry?.lists ?? []).filter((list) => list !== id).at(-1);
  return { home: around(element), bound: root === undefined ? null : PAGE.closest(element, root) };
}

/** The page as a rectangle reads it: every marked element in document order. */
export type RectRead = { elements: Element[]; items: RectItem[] };

/** `locked`: a rectangle takes none of them, nor anything inside one. */
export function readRect(locked: ReadonlySet<string>): RectRead {
  const elements = [...document.querySelectorAll(MARKED)];
  const index = new Map(elements.map((element, at) => [element, at]));
  /** The element, or one around it, is locked. */
  const shut: boolean[] = [];
  const items = elements.map((element, at) => {
    const id = idAt(element);
    const parent = around(element);
    const up = parent ? (index.get(parent) ?? -1) : -1;
    const closed = locked.has(id) || shut[up] === true;
    shut[at] = closed;
    return { id: accepted(id) && !closed ? id : null, box: boxOf(element), parent: up };
  });
  return { elements, items };
}

/**
 * The copies a rectangle took (`taken`: their places in `read`), as a `rect` message names them:
 * each with its `item` and its `path`, as a pick has them.
 */
export function picksOf(
  taken: readonly number[],
  read: RectRead,
  entries: ReadonlyMap<string, FrameEntry>,
): CopyRef[] {
  const byId = new Map<string, Element[]>();
  for (const element of read.elements) {
    const copies = byId.get(idAt(element));
    if (copies) copies.push(element);
    else byId.set(idAt(element), [element]);
  }
  // The copies come from what the rectangle read, so the page is not searched once per copy.
  const page: PathReader<Element> = {
    closest: (node, id) => PAGE.closest(node, id),
    copies: (id, within) =>
      (byId.get(id) ?? []).filter((element) => within === null || within.contains(element)),
  };
  const picks: CopyRef[] = [];
  for (const at of taken) {
    const element = read.elements[at];
    const id = read.items[at]?.id;
    if (!element || id === null || id === undefined) continue;
    picks.push({ id, ...copyOf(element, byId.get(id) ?? [], entries.get(id)?.lists, page) });
  }
  return picks;
}

/** One list of an item on the page: the element its rows sit in, and one row for each copy. */
type PageList = { parent: Element; rows: Element[]; prefix: number[] };

/** The lists a dragged item can go to, as elements, and where the item itself stands. */
export type PageLists = { lists: PageList[]; own: OwnPlace | null };

/** The child of `parent` that `element` sits in, or is. */
function under(parent: Element, element: Element): Element {
  let at = element;
  while (at.parentElement && at.parentElement !== parent) at = at.parentElement;
  return at;
}

/**
 * The element all of `copies` sit in and, for each copy, the child of it that holds the copy: the
 * copy itself, or the wrapper a kit component puts around it. `null` when two copies share a
 * child: there is no order of rows to read then.
 */
function rowsOf(copies: readonly Element[]): { parent: Element; rows: Element[] } | null {
  let parent: Element | null = copies[0]?.parentElement ?? null;
  for (const copy of copies) {
    while (parent && !parent.contains(copy)) parent = parent.parentElement;
  }
  if (!parent) return null;
  const inside = parent;
  const rows = copies.map((copy) => under(inside, copy));
  return new Set(rows).size === rows.length ? { parent: inside, rows } : null;
}

/**
 * The lists of the item `id` (`lists`: its entry's, the item's own id last): its copies grouped
 * by the copy of the list root one level out, each group with the path of that copy. `item`: the
 * dragged copy's place among the elements that carry `id`. A list with no copy has no element on
 * the page, so it is not among them.
 */
export function readLists(
  id: string,
  item: number,
  lists: readonly string[] | null | undefined,
): PageLists {
  // Without its own id last the page cannot say which copies make one list.
  if (!lists || lists.at(-1) !== id) return { lists: [], own: null };
  const copies = elementsWith(new Set([id]));
  const dragged = copies[item];
  const outer = lists.at(-2);
  const outerOf = outer === undefined ? undefined : (copy: Element) => PAGE.closest(copy, outer);
  const found: PageList[] = [];
  let own: OwnPlace | null = null;
  for (const group of listsOf(copies, outerOf)) {
    const rows = rowsOf(group.copies);
    const prefix = group.outer === null ? [] : copyPath(group.outer, lists.slice(0, -1), PAGE);
    if (!rows || prefix === null) continue;
    const index = dragged ? group.copies.indexOf(dragged) : -1;
    if (index >= 0) own = { list: found.length, index };
    found.push({ ...rows, prefix });
  }
  return { lists: found, own };
}

/** The lists as the rules take them: the boxes as they are now, and each parent's flow. */
export function measureLists(read: PageLists): ItemList[] {
  return read.lists.map(({ parent, rows, prefix }) => ({
    parent: boxOf(parent),
    flow: flowAt(window, parent),
    copies: rows.map(boxOf),
    prefix,
  }));
}

/** One copy of a drop to show: the nodes that move and the element they go to. */
export type DropCopy = { nodes: Element[]; anchor: Element };

/** `root` when it carries `id`, else the first element inside it that does. */
function inside(root: Element, id: string): Element | undefined {
  if (idAt(root) === id) return root;
  for (const element of root.querySelectorAll(MARKED)) {
    if (idAt(element) === id) return element;
  }
  return undefined;
}

function nearestOf(elements: readonly Element[], point: Point | undefined): Element | undefined {
  if (elements.length < 2 || !point) return elements[0];
  let nearest: Element | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const element of elements) {
    const far = distance(point, boxOf(element));
    if (far >= best) continue;
    best = far;
    nearest = element;
  }
  return nearest;
}

/**
 * What the preview of a dropped element moves. Outside a list: the dragged elements, to the copy
 * of the anchor nearest `point` (where the pointer let go). A part of a list item's template
 * (`bound`: the copy of the item it was dragged in): the same part in every copy of that item,
 * each to the anchor of its own copy, the dragged copy first.
 */
export function dropsOf(
  ids: readonly string[],
  anchor: string,
  dragged: readonly Element[],
  bound: Element | null,
  point: Point | undefined,
): DropCopy[] {
  if (bound === null) {
    const to = nearestOf(elementsWith(new Set([anchor])), point);
    return to ? [{ nodes: [...dragged], anchor: to }] : [];
  }
  const others = elementsWith(new Set([idAt(bound)])).filter((root) => root !== bound);
  const drops: DropCopy[] = [];
  for (const root of [bound, ...others].slice(0, MAX_DROP_COPIES)) {
    const to = inside(root, anchor);
    const parts = ids.map((id) => inside(root, id));
    const nodes = root === bound ? [...dragged] : parts.filter((part) => part !== undefined);
    if (to && nodes.length === ids.length) drops.push({ nodes, anchor: to });
  }
  return drops;
}
