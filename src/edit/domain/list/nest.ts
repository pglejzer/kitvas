// The lists around an element, from the outside in (ADR 0060): each `.map` whose callback returns
// the JSX that holds the element, with that JSX's root element, and for one rendered copy the
// item it shows in each list. The innermost list is read last: one that maps over a field of an
// outer item (`plan.features`) is the array literal in that field of the outer item the path
// names; a literal array or a `const` of the file is read as `find.ts` reads it. An element inside
// a condition or a fragment of a callback belongs to the item of the callback's copy it sits in.
// Pure, like `find.ts`.

import type { Refusal } from '../types.ts';
import {
  type ArrayView,
  arrayAt,
  chainAt,
  type ItemView,
  type Param,
  paramOf,
  receiverOf,
} from './find.ts';
import {
  type Callback,
  callbackOf,
  charAt,
  closeOf,
  mapsAround,
  type Region,
  regionsTo,
  wordAt,
} from './path.ts';
import { bindingOf } from './scope.ts';
import { fieldAt } from './text.ts';

/** One `.map` around an element: the regions down to its call, its callback, its root's `<`. */
export type Level = { regions: Region[]; callback: Callback; root: number };

/** The JavaScript down to an element, and its lists; `levels: null` when one is not one per item. */
export type Around = { regions: Region[]; levels: Level[] | null };

/** A list read for one copy: its array, its callback's first parameter, and the copy's item. */
export type ItemAt = { array: ArrayView; param: Param; item: ItemView };

/** What a name read through a parameter is: the item (`key: null`) or a field of it. */
export type ParamRead = { key: string | null } | 'unread';

/**
 * The lists around the element whose `<` is at `at`, outer first. A `.map` whose callback does
 * not return one root element per item (a condition at its top, a fragment root, `flatMap`) makes
 * `levels` `null`: its copies cannot be counted. `null` when `at` is no element's `<`.
 */
export function aroundOf(text: string, at: number): Around | null {
  const regions = regionsTo(text, at);
  if (regions.length === 0) return null;
  const levels: Level[] = [];
  for (const [index, region] of regions.entries()) {
    const token = region.tokens[region.root];
    const callback = callbackOf(region, region.root);
    if (token === undefined || callback === null) continue;
    levels.push({ regions: regions.slice(0, index + 1), callback, root: token.start });
  }
  const counted = levels.length === mapsAround(regions, at);
  const named = levels.every((level) => text.charAt(level.root + 1) !== '>');
  return { regions, levels: counted && named ? levels : null };
}

/**
 * What `name` (or `name.field`) reads through the parameter `param`: the item or a field of it;
 * `null` when the parameter does not bind the name, `unread` when it binds it in a way the editor
 * does not read (`({ meta }) => meta.title`).
 */
export function readThrough(param: Param, name: string, field: string | null): ParamRead | null {
  if (param.kind === 'name') return param.name === name ? { key: field } : null;
  if (param.kind !== 'fields') return null;
  const key = param.fields.get(name);
  if (key === undefined) return null;
  return field === null ? { key } : 'unread';
}

/** The array literal `item` is (`key: null`) or holds in its field `key`. */
function arrayIn(at: ItemAt, key: string | null): ArrayView | null {
  const { reader } = at.array;
  const start = key === null ? at.item.first : fieldAt(reader, at.item, key);
  if (start === null || charAt(reader, start) !== '[') return null;
  const close = closeOf(reader, start);
  const ends =
    key === null
      ? close === at.item.last
      : charAt(reader, close + 1) === ',' || close + 1 === at.item.last;
  return close >= 0 && ends ? arrayAt(reader, start) : null;
}

/** The array a level maps over, with the items of the levels outside it already read. */
function arrayOf(level: Level, outer: readonly ItemAt[]): ArrayView | null {
  const list = receiverOf(level.regions, level.callback);
  if (list.kind === 'literal') return list.array;
  if (list.kind !== 'computed') return null;
  const last = level.regions[level.regions.length - 1];
  if (last === undefined) return null;
  let end = level.callback.dot - 1;
  if (charAt(last, end) === '?') end -= 1;
  // `plan.features` or `features`: a parameter of an outer callback, or a field of it.
  const chain = chainAt(last, end);
  if (chain === null || chain.length > 2) return null;
  const name = wordAt(last, chain.root);
  const use = last.tokens[chain.root]?.start ?? 0;
  if (bindingOf(level.regions, name, use)?.kind !== 'param') return null;
  const field = chain.length === 2 ? wordAt(last, end) : null;
  for (let index = outer.length - 1; index >= 0; index -= 1) {
    const at = outer[index];
    const read = at === undefined ? null : readThrough(at.param, name, field);
    if (at === undefined || read === null) continue;
    return read === 'unread' ? null : arrayIn(at, read.key);
  }
  return null;
}

/**
 * Each level's array and the item of the copy at `path` (its place in each list, outer first).
 * `not-found`: the path names another number of lists; `list-item-gone`: a list has no item at
 * that place; `list-not-literal`: a list is no array literal the editor reads.
 */
export function itemsAt(levels: readonly Level[], path: readonly number[]): ItemAt[] | Refusal {
  if (path.length !== levels.length) return 'not-found';
  const out: ItemAt[] = [];
  for (const [index, level] of levels.entries()) {
    const array = arrayOf(level, out);
    const region = level.regions[level.regions.length - 1];
    if (array === null || region === undefined) return 'list-not-literal';
    const item = array.items[path[index] ?? -1];
    if (item === undefined) return 'list-item-gone';
    out.push({ array, param: paramOf(region, level.callback), item });
  }
  return out;
}

/**
 * The array the innermost list maps over in the copy whose outer lists stand at `parents` (one
 * place per level but the last); it may hold no item. The refusals are `itemsAt`'s.
 */
export function innerArrayAt(
  levels: readonly Level[],
  parents: readonly number[],
): ArrayView | Refusal {
  const inner = levels[levels.length - 1];
  if (inner === undefined || parents.length !== levels.length - 1) return 'not-found';
  const outer = itemsAt(levels.slice(0, -1), parents);
  if (typeof outer === 'string') return outer;
  return arrayOf(inner, outer) ?? 'list-not-literal';
}

/** The most items `copyPlace` reads on its way: a list this long is not counted. */
const MAX_COUNTED = 10_000;

/**
 * Among all the copies the innermost list renders (every outer item's array after the one
 * before it, as the page shows them), the place of the copy at `path` and how many there are.
 * `null` when a list on the way is no array literal, or `path` names no copy. It counts what
 * the arrays hold: a list drawn only for some outer items has fewer copies on the page.
 */
export function copyPlace(
  levels: readonly Level[],
  path: readonly number[],
): { copy: number; copies: number } | null {
  if (levels.length === 0 || path.length !== levels.length) return null;
  // `copy` stays -1 until the walk reaches the copy `path` names.
  const count = { copy: -1, copies: 0, read: 0 };
  const walk = (depth: number, outer: readonly ItemAt[], onPath: boolean): boolean => {
    const level = levels[depth];
    if (level === undefined) return false;
    const region = level.regions[level.regions.length - 1];
    const array = arrayOf(level, outer);
    if (region === undefined || array === null) return false;
    const place = path[depth] ?? -1;
    if (depth === levels.length - 1) {
      if (onPath && place >= 0 && place < array.items.length) count.copy = count.copies + place;
      count.copies += array.items.length;
      return true;
    }
    const param = paramOf(region, level.callback);
    for (const [index, item] of array.items.entries()) {
      count.read += 1;
      if (count.read > MAX_COUNTED) return false;
      const here = [...outer, { array, param, item }];
      if (!walk(depth + 1, here, onPath && index === place)) return false;
    }
    return true;
  };
  if (!walk(0, [], true) || count.copy < 0) return null;
  return { copy: count.copy, copies: count.copies };
}
