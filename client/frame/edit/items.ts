// Data list items in the frame (spec 4c, goal 9; plan 16, task D). Every copy a `.map` renders
// carries the same element id, so a pick also says which copy it was (its place among them in
// document order), and a `select` with an `item` outlines only that copy, and the inline text
// edit takes it. ADR 0060 adds the copy's path through nested lists, by the copies of each list's
// root element. The rules are pure over plain values; the readers of the page come last.

import { MAX_INLINE_TEXT } from '../../channel/edit-protocol.ts';
import { elementsWith } from './tree.ts';

/** The copy the page chose: copy `item` (from 0, document order) of the elements carrying `id`. */
export type ItemChoice = { id: string; item: number } | null;

/** `element`'s place among `copies`; `undefined` when it is the only copy or not among them. */
export function placeAmong<T>(element: T, copies: readonly T[]): number | undefined {
  if (copies.length < 2) return undefined;
  const at = copies.indexOf(element);
  return at < 0 ? undefined : at;
}

/** The choice a `select` makes: its `item` applies to its first id. */
export function choiceOf(ids: readonly string[], item: number | undefined): ItemChoice {
  const id = ids[0];
  return id === undefined || item === undefined ? null : { id, item };
}

/**
 * The elements outlined for a selection: all of them, but only the chosen copy of the chosen id.
 * A choice past the last copy (the page has not heard of a new build yet) keeps every copy.
 */
export function onlyChosen<T>(
  elements: readonly T[],
  idOf: (element: T) => string | null,
  choice: ItemChoice,
): T[] {
  if (choice === null) return [...elements];
  const kept = elements.filter((element) => idOf(element) === choice.id)[choice.item];
  if (kept === undefined) return [...elements];
  return elements.filter((element) => idOf(element) !== choice.id || element === kept);
}

/** The copy an inline text edit of `id` takes: the chosen one for that id, else the first. */
export function copyFor<T>(copies: readonly T[], id: string, choice: ItemChoice): T | undefined {
  const chosen = choice?.id === id ? copies[choice.item] : undefined;
  return chosen ?? copies[0];
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

// The page's side: thin readers for the rules above.

const idOf = (element: Element): string | null => element.getAttribute('data-ks');

const PAGE: PathReader<Element> = {
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

/** `{ item }` for a pick of `element` (its id is `id`) when several elements carry that id. */
export function itemOfPick(element: Element | null, id: string | null): { item?: number } {
  if (element === null || id === null) return {};
  const item = placeAmong(element, elementsWith(new Set([id])));
  return item === undefined ? {} : { item };
}

/** The selected elements the outlines go around: of a list item, only the chosen copy. */
export function chosenElements(ids: ReadonlySet<string>, choice: ItemChoice): Element[] {
  return onlyChosen(elementsWith(ids), idOf, choice);
}

/** The element the inline text edit of `id` takes. */
export function textElement(id: string, choice: ItemChoice): Element | undefined {
  return copyFor(elementsWith(new Set([id])), id, choice);
}

/**
 * Copy `item` of `id` exactly, the first without `item` (ADR 0060): a copy the page named that is
 * no longer there is none, never another one.
 */
export function copyAt(id: string, item: number | undefined): Element | undefined {
  return elementsWith(new Set([id]))[item ?? 0];
}
