// What the inspect says about the list an element is rendered by (spec 4c, goal 9; ADR 0065):
// its kind, whether the element is the list's item (the root its callback returns) or a part of
// one, and for one rendered copy, named by its path, the array that copy's item stands in. A
// list inside another one is read for that copy only: each outer item has an array of its own.

import type { Refusal } from '../types.ts';
import { itemTexts } from './edit.ts';
import { type ListKind, listInfo } from './find.ts';
import { aroundOf, copyPlace, innerArrayAt } from './nest.ts';

/** The inspect's `list` (`InspectSchema`). */
export type ListView = {
  kind: ListKind;
  /** The items of the array the copy's item stands in; `null` when it is not read. */
  count: number | null;
  reason: Refusal | null;
  /** The string each item shows as the element's text; only for a list in no other list. */
  texts: (string | null)[] | null;
  /** The element is the root its innermost list's callback returns: the item itself. */
  root: boolean;
  /**
   * Asked with a path: the place of that copy of the item among all the copies its list renders,
   * and how many the arrays hold; `null` when an array on the way is not read.
   */
  copy?: number | null;
  copies?: number | null;
};

/**
 * The list of the element whose `<` is at `at`; `null` when no `.map` renders it. `path`: one
 * rendered copy, its place in each list around the element, outer first.
 */
export function listView(text: string, at: number, path?: readonly number[]): ListView | null {
  const flat = listInfo(text, at);
  if (flat === null) return null;
  const levels = aroundOf(text, at)?.levels ?? null;
  const root = levels !== null && levels[levels.length - 1]?.root === at;
  const place = levels === null || path === undefined ? null : copyPlace(levels, path);
  const counted =
    path === undefined ? {} : { copy: place?.copy ?? null, copies: place?.copies ?? null };
  if (levels === null || levels.length < 2) {
    return { ...flat, texts: itemTexts(text, at), root, ...counted };
  }
  // Without a path the first copy says whether the arrays are literals; its count is its own.
  const parents = path === undefined ? levels.slice(1).map(() => 0) : path.slice(0, -1);
  const array = innerArrayAt(levels, parents);
  if (typeof array === 'string') {
    const reason: Refusal = 'list-not-literal';
    return { kind: 'computed', count: null, reason, texts: null, root, ...counted };
  }
  const count = path === undefined ? null : array.items.length;
  return { kind: 'literal', count, reason: null, texts: null, root, ...counted };
}
