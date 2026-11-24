// The list ops on a text (spec 4c, goal 9; plan 16, task D): move, duplicate, remove and retext
// one item of the literal array a `.map` renders. `list-ops.ts` in the app finds the element and
// keeps the result; the server's inverse follows from the changed text, as for every structural op.

import type { EditOp } from '../ops.ts';
import type { ApplyOptions, Refusal } from '../types.ts';
import { findList, type MappedList } from './find.ts';
import { duplicateItemText, type ListEdit, moveItemText, removeItemText } from './items.ts';
import { writeTextSource } from './source.ts';
import { encodeString, stringAt, textField, tokenSpan, valueToken } from './text.ts';

export type ListOp = Extract<
  EditOp,
  { op: 'moveItem' | 'duplicateItem' | 'removeItem' | 'setItemText' }
>;

export type ListResult = ListEdit | { refused: Refusal } | { conflict: 'changed' };

type Literal = Extract<MappedList, { kind: 'literal' }>;

const unchanged = (text: string): ListEdit => ({ text, moved: (old) => old });

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

/**
 * `op` on the list that renders the element whose `<` is at `at`. A list over anything but a
 * literal array of this file is `list-not-literal`; an index past its end is `list-item-gone`.
 * A `setItemText` with a `path` (ADR 0060) writes the one string literal that renders its
 * `before` at that copy (`source.ts`), in or outside any list.
 */
export function applyListEdit(
  text: string,
  at: number,
  op: ListOp,
  options: ApplyOptions,
): ListResult {
  if (op.op === 'setItemText' && op.path !== undefined) {
    return writeTextSource(text, at, { value: op.value, before: op.before, path: op.path });
  }
  const list = findList(text, at);
  if (list === null || list.kind !== 'literal') return { refused: 'list-not-literal' };
  const { array } = list;
  const count = array.items.length;
  if (op.item >= count) return { refused: 'list-item-gone' };
  switch (op.op) {
    case 'moveItem':
      if (op.to >= count) return { refused: 'list-item-gone' };
      return op.to === op.item ? unchanged(text) : moveItemText(text, array, op.item, op.to);
    case 'duplicateItem':
      return duplicateItemText(text, array, op.item);
    case 'removeItem':
      return removeItemText(text, array, op.item);
    case 'setItemText':
      return retext(text, at, list, op, options);
  }
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
