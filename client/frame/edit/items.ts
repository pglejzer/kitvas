// Rendered copies in the frame (spec 4c, goal 9; plan 16, task D; ADR 0066). Every copy a `.map`
// renders carries the same element id, so a pick also says which copy it was (its place among
// them in document order, and its path through the lists around it, ADR 0060), a `select` names
// the copies it outlines, and the inline text edit takes one of them. The rules are pure over
// plain values; the readers of the page come last.

import { MAX_INLINE_TEXT, MAX_LIST_DEPTH } from '../../channel/edit-protocol.ts';
import { elementsWith } from './tree.ts';

/** The largest place the protocol carries (its `isItem`). */
const MAX_PLACE = 10_000;

/** The copies the page chose (`select`'s `copies`): for each id, the places of its chosen ones. */
export type Chosen = ReadonlyMap<string, readonly number[]>;

/** `element`'s place among `copies`; `undefined` when it is the only copy or not among them. */
export function placeAmong<T>(element: T, copies: readonly T[]): number | undefined {
  if (copies.length < 2) return undefined;
  const at = copies.indexOf(element);
  return at < 0 ? undefined : at;
}

/** The choice a `select` makes: the places it names, by id, each once. */
export function chosenOf(copies: readonly { id: string; item: number }[] | undefined): Chosen {
  const chosen = new Map<string, number[]>();
  for (const { id, item } of copies ?? []) {
    const places = chosen.get(id);
    if (places === undefined) chosen.set(id, [item]);
    else if (!places.includes(item)) places.push(item);
  }
  return chosen;
}

/**
 * The elements outlined for a selection: of an id with chosen copies only those copies, of any
 * other id every copy. A chosen copy the page does not have (it has not heard of a new build yet)
 * keeps every copy of its id.
 */
export function onlyChosen<T>(
  elements: readonly T[],
  idOf: (element: T) => string | null,
  chosen: Chosen,
): T[] {
  if (chosen.size === 0) return [...elements];
  const byId = new Map<string, T[]>();
  for (const element of elements) {
    const id = idOf(element);
    if (id === null || !chosen.has(id)) continue;
    const copies = byId.get(id);
    if (copies) copies.push(element);
    else byId.set(id, [element]);
  }
  const kept = new Set<T>();
  /** The ids that keep every copy. */
  const whole = new Set<string>();
  for (const [id, places] of chosen) {
    const copies = byId.get(id) ?? [];
    const found = places.map((place) => copies[place]);
    if (found.includes(undefined)) whole.add(id);
    for (const copy of found) if (copy !== undefined) kept.add(copy);
  }
  return elements.filter((element) => {
    const id = idOf(element);
    return id === null || !chosen.has(id) || whole.has(id) || kept.has(element);
  });
}

/** The copy an inline text edit of `id` takes: the first chosen one of that id, else the first. */
export function copyFor<T>(copies: readonly T[], id: string, chosen: Chosen): T | undefined {
  const place = chosen.get(id)?.[0];
  const copy = place === undefined ? undefined : copies[place];
  return copy ?? copies[0];
}

/** One copy: its id, and its place when the page named one. */
export type OneCopy = { id: string; item?: number };

/**
 * The one copy the handles stay on: a selection of one id with at most one chosen copy. Without
 * a chosen copy the element must be the only one that carries the id (`soleElement` reads that).
 * `null` for no selection, several ids or several chosen copies.
 */
export function soleCopy(ids: readonly string[], chosen: Chosen): OneCopy | null {
  const id = ids[0];
  if (id === undefined || ids.length !== 1) return null;
  const places = chosen.get(id) ?? [];
  if (places.length > 1) return null;
  const item = places[0];
  return item === undefined ? { id } : { id, item };
}

/** How the path of a copy reads the page; plain values stand in for elements in the tests. */
export type PathReader<T> = {
  /** `node` itself or its nearest ancestor that carries `id`; `null` when none does. */
  closest(node: T, id: string): T | null;
  /** Every element that carries `id` inside `within` (`null`: the whole page), in page order. */
  copies(id: string, within: T | null): readonly T[];
};

/**
 * ADR 0060: where the copy `picked` stands in the lists whose root elements carry `roots` (outer
 * first). For each root, the place of the copy of it around `picked` among that root's copies
 * inside the copy of the root before it: the item of each list the copy shows. `null` when a
 * root has no copy around it.
 */
export function copyPath<T>(
  picked: T,
  roots: readonly string[],
  read: PathReader<T>,
): number[] | null {
  const path: number[] = [];
  let within: T | null = null;
  for (const root of roots) {
    const copy = read.closest(picked, root);
    if (copy === null) return null;
    const place = read.copies(root, within).indexOf(copy);
    if (place < 0) return null;
    path.push(place);
    within = copy;
  }
  return path;
}

/** A path the protocol carries: no deeper than its lists go, every place within its bound. */
export const carried = (path: readonly number[]): boolean =>
  path.length <= MAX_LIST_DEPTH && path.every((place) => place <= MAX_PLACE);

/**
 * What a message says of the copy `element`, one of `copies` (the elements that carry its id):
 * `item` when there are several, and `path` when `lists` (the structure's `FrameEntry.lists` of
 * the id) names lists around it and `read` can count the copy in each. A place or a path the
 * protocol does not carry is left out: the studio would refuse the whole message for it.
 */
export function copyOf<T>(
  element: T,
  copies: readonly T[],
  lists: readonly string[] | null | undefined,
  read: PathReader<T>,
): { item?: number; path?: number[] } {
  const item = placeAmong(element, copies);
  const path = lists && lists.length > 0 ? copyPath(element, lists, read) : null;
  return {
    ...(item === undefined || item > MAX_PLACE ? {} : { item }),
    ...(path !== null && carried(path) ? { path } : {}),
  };
}

// The page's side: thin readers for the rules above.

const idOf = (element: Element): string | null => element.getAttribute('data-ks');

export const PAGE: PathReader<Element> = {
  closest(node, id) {
    for (let at: Element | null = node; at !== null; at = at.parentElement) {
      if (idOf(at) === id) return at;
    }
    return null;
  },
  copies: (id, within) =>
    elementsWith(new Set([id])).filter((element) => within === null || within.contains(element)),
};

/**
 * The answer to `locate-copy`: the path of copy `item` of `id` (the first one without `item`)
 * through the lists of `roots`, and the text it shows. `text: null` when the copy is not there,
 * holds elements (only plain text is typed in place) or is longer than the protocol carries.
 */
export function locateCopy(
  id: string,
  item: number | undefined,
  roots: readonly string[],
): { path: number[] | null; text: string | null } {
  const element = copyAt(id, item);
  if (element === undefined) return { path: null, text: null };
  const plain = element instanceof HTMLElement && element.childElementCount === 0;
  const shown = plain ? (element.textContent ?? '') : null;
  const text = shown !== null && shown.length <= MAX_INLINE_TEXT ? shown : null;
  return { path: copyPath(element, roots, PAGE), text };
}

/** What a pick says of the copy `element` (its id is `id`), read from the page (`copyOf`). */
export function copyOfPick(
  element: Element | null,
  id: string | null,
  lists: readonly string[] | null | undefined,
): { item?: number; path?: number[] } {
  if (element === null || id === null) return {};
  return copyOf(element, elementsWith(new Set([id])), lists, PAGE);
}

/** The selected elements the outlines go around: of an id with chosen copies, only those. */
export function chosenElements(ids: ReadonlySet<string>, chosen: Chosen): Element[] {
  return onlyChosen(elementsWith(ids), idOf, chosen);
}

/** The element the inline text edit of `id` takes. */
export function textElement(id: string, chosen: Chosen): Element | undefined {
  return copyFor(elementsWith(new Set([id])), id, chosen);
}

/**
 * Copy `item` of `id` exactly, the first without `item` (ADR 0060): a copy the page named that is
 * no longer there is none, never another one.
 */
export function copyAt(id: string, item: number | undefined): Element | undefined {
  return elementsWith(new Set([id]))[item ?? 0];
}

/**
 * The element of one copy (`soleCopy`): copy `item` exactly, or without one the only element that
 * carries `id`. `undefined` when that copy is not there, or when several carry the id.
 */
export function soleElement(id: string, item: number | undefined): Element | undefined {
  const copies = elementsWith(new Set([id]));
  if (item !== undefined) return copies[item];
  return copies.length === 1 ? copies[0] : undefined;
}
