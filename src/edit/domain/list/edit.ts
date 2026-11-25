// The list ops on a text (spec 4c, goal 9; plan 16, task D; ADR 0065): move, duplicate, remove
// and retext one item of the literal array a `.map` renders. An item is the root element its
// list's callback returns: the three item ops are for that element only. With a `path` they are
// for the innermost list of one copy (the features of one plan), and a move may take the item to
// the same list of another parent. `list-ops.ts` in the app finds the element and keeps the
// result; the server's inverse follows from the changed text, as for every structural op.

import type { EditOp } from '../ops.ts';
import type { ApplyOptions, Refusal } from '../types.ts';
import { type ArrayView, findList, type MappedList } from './find.ts';
import {
  duplicateItemText,
  type ListEdit,
  moveAcrossText,
  moveItemText,
  removeItemText,
} from './items.ts';
import { aroundOf, innerArrayAt, itemsAt, type Level } from './nest.ts';
import { writeTextSource } from './source.ts';
import { encodeString, stringAt, textField, tokenSpan, valueToken } from './text.ts';

export type ListOp = Extract<
  EditOp,
  { op: 'moveItem' | 'duplicateItem' | 'removeItem' | 'setItemText' }
>;

export type ListResult = ListEdit | { refused: Refusal } | { conflict: 'changed' };

type Literal = Extract<MappedList, { kind: 'literal' }>;
type ItemOp = Exclude<ListOp, { op: 'setItemText' }>;

const unchanged = (text: string): ListEdit => ({ text, moved: (old) => old });
const refuse = (refused: Refusal): { refused: Refusal } => ({ refused });

/** The item's string the element at `at` shows, written as `op.value`. */
function retext(
  text: string,
  at: number,
  list: Literal,
  op: Extract<ListOp, { op: 'setItemText' }>,
  options: ApplyOptions,
): ListResult {
  const { array } = list;
  const item = array.items[op.item];
  if (item === undefined) return { refused: 'list-item-gone' };
  const shown = textField(text, at, list.param);
  const token = shown === null ? null : valueToken(array, item, shown.field);
  const current = token === null ? null : stringAt(array.reader, token);
  if (token === null || current === null) return { refused: 'list-text-not-literal' };
  if (!options.force && current !== op.before) return { conflict: 'changed' };
  if (current === op.value) return unchanged(text);
  const span = tokenSpan(array.reader, token);
  const written = encodeString(op.value, text.charAt(span.start));
  const shift = written.length - (span.end - span.start);
  return {
    text: text.slice(0, span.start) + written + text.slice(span.end),
    moved: (old) => (old < span.start ? old : old >= span.end ? old + shift : null),
  };
}

/** Where an array's `[` stands in the file: two views of one array share it. */
const openOf = (array: ArrayView): number => array.reader.tokens[array.open]?.start ?? -1;

/** The item at `item` of `array` to the index `to` it has afterwards. */
function moveWithin(text: string, array: ArrayView, item: number, to: number): ListResult {
  if (to >= array.items.length) return refuse('list-item-gone');
  return to === item ? unchanged(text) : moveItemText(text, array, item, to);
}

/**
 * A move to `toPath`: in the item's own array to that index, in the same list of another parent
 * to that place among its items as they are.
 */
function moveTo(
  text: string,
  levels: readonly Level[],
  array: ArrayView,
  path: readonly number[],
  toPath: readonly number[],
): ListResult {
  const item = path[path.length - 1];
  const place = toPath[toPath.length - 1];
  if (toPath.length !== path.length || item === undefined || place === undefined) {
    return refuse('not-found');
  }
  const sameParent = path.slice(0, -1).every((at, depth) => at === toPath[depth]);
  if (sameParent) return moveWithin(text, array, item, place);
  const target = innerArrayAt(levels, toPath.slice(0, -1));
  if (typeof target === 'string') return refuse(target);
  if (place > target.items.length) return refuse('list-item-gone');
  // Two parents may show one array (a list that reads no outer item): the place is then counted
  // with the item still there.
  if (openOf(target) === openOf(array)) {
    return moveWithin(text, array, item, place > item ? place - 1 : place);
  }
  return moveAcrossText(text, array, item, target, place) ?? refuse('list-item-gone');
}

/** An item op with a `path`: on the array the innermost list maps over in that copy. */
function itemAtPath(
  text: string,
  levels: readonly Level[],
  op: ItemOp,
  path: readonly number[],
): ListResult {
  const read = itemsAt(levels, path);
  if (typeof read === 'string') return refuse(read);
  const array = read[read.length - 1]?.array;
  const item = path[path.length - 1];
  if (array === undefined || item === undefined) return refuse('not-found');
  switch (op.op) {
    case 'moveItem':
      return op.toPath === undefined
        ? moveWithin(text, array, item, op.to)
        : moveTo(text, levels, array, path, op.toPath);
    case 'duplicateItem':
      return duplicateItemText(text, array, item);
    case 'removeItem':
      return removeItemText(text, array, item);
  }
}

/** A move, a copy or a removal of the item the element at `at` is. */
function itemEdit(text: string, at: number, op: ItemOp): ListResult {
  const levels = aroundOf(text, at)?.levels ?? [];
  const inner = levels[levels.length - 1];
  // In no list, or in one whose copies cannot be counted.
  if (inner === undefined) return refuse('list-not-literal');
  // A part of an item is an element of the template: the item ops are for the item's root.
  if (inner.root !== at) return refuse('not-list-item');
  if (op.path !== undefined) return itemAtPath(text, levels, op, op.path);
  if (op.op === 'moveItem' && op.toPath !== undefined) return refuse('not-found');
  const list = findList(text, at);
  if (list === null || list.kind !== 'literal') return refuse('list-not-literal');
  const { array } = list;
  if (op.item >= array.items.length) return refuse('list-item-gone');
  switch (op.op) {
    case 'moveItem':
      return moveWithin(text, array, op.item, op.to);
    case 'duplicateItem':
      return duplicateItemText(text, array, op.item);
    case 'removeItem':
      return removeItemText(text, array, op.item);
  }
}

/**
 * `op` on the list that renders the element whose `<` is at `at`. A list over anything but a
 * literal array of this file is `list-not-literal`; an index past its end is `list-item-gone`; a
 * move, a copy or a removal on an element that is not the root its list's callback returns is
 * `not-list-item`. A `setItemText` with a `path` (ADR 0060) writes the one string literal that
 * renders its `before` at that copy (`source.ts`), in or outside any list.
 */
export function applyListEdit(
  text: string,
  at: number,
  op: ListOp,
  options: ApplyOptions,
): ListResult {
  if (op.op !== 'setItemText') return itemEdit(text, at, op);
  if (op.path !== undefined) {
    return writeTextSource(text, at, { value: op.value, before: op.before, path: op.path });
  }
  const list = findList(text, at);
  if (list === null || list.kind !== 'literal') return refuse('list-not-literal');
  return retext(text, at, list, op, options);
}

/**
 * The string each item shows as the element's text, in array order (`null` for an item whose
 * value is not a string literal); `null` when the element's text is no field of a literal list.
 * The editor sends the item's string back as `setItemText`'s `before`.
 */
export function itemTexts(text: string, at: number): (string | null)[] | null {
  const list = findList(text, at);
  if (list === null || list.kind !== 'literal') return null;
  const shown = textField(text, at, list.param);
  if (shown === null) return null;
  const { array } = list;
  return array.items.map((item) => {
    const token = valueToken(array, item, shown.field);
    return token === null ? null : stringAt(array.reader, token);
  });
}
