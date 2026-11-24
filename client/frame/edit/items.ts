// Data list items in the frame (spec 4c, goal 9; plan 16, task D). Every copy a `.map` renders
// carries the same element id, so a pick also says which copy it was (its place among them in
// document order), and a `select` with an `item` outlines only that copy, and the inline text
// edit takes it. The rules are pure over plain values; the readers of the page come last.

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

// The page's side: thin readers for the rules above.

const idOf = (element: Element): string | null => element.getAttribute('data-ks');

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
