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
