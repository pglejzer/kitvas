// Moving, duplicating and removing one item of a literal array (spec 4c, goal 9; plan 16, task
// D). Only the touched items' text is rewritten: every comma, line break, indentation and comment
// between items stays where it is, and a trailing comma stays as written. A move swaps item texts
// between the places they had, so each place keeps its own separator.

import type { OffsetMap, Span } from '../types.ts';
import type { ArrayView } from './find.ts';
import { copyText } from './keys.ts';

/** A changed text and where each offset of the old text went (`null`: it was removed). */
export type ListEdit = { text: string; moved: OffsetMap };

/** One piece of a rebuilt range: new text, or the old text that started at `from`. */
type Piece = { text: string; from: number | null };

/** `range` of `text` replaced by `pieces`; old offsets follow the piece they were copied into. */
function rebuild(text: string, range: Span, pieces: readonly Piece[]): ListEdit {
  const placed: { from: number; to: number; length: number }[] = [];
  let body = '';
  for (const piece of pieces) {
    if (piece.from !== null) {
      placed.push({ from: piece.from, to: range.start + body.length, length: piece.text.length });
    }
    body += piece.text;
  }
  const shift = body.length - (range.end - range.start);
  const moved: OffsetMap = (old) => {
    if (old < range.start) return old;
    if (old >= range.end) return old + shift;
    const hit = placed.find((place) => place.from <= old && old < place.from + place.length);
    return hit === undefined ? null : hit.to + (old - hit.from);
  };
  return { text: text.slice(0, range.start) + body + text.slice(range.end), moved };
}

const slice = (text: string, span: Span): Piece => ({
  text: text.slice(span.start, span.end),
  from: span.start,
});

/**
 * A separator like `between` (the text between two items) for a new item: a comma, then the
 * same line break and indentation, or the same spaces on one line. Comments are left out.
 */
export function separatorLike(between: string, oneLine = ' '): string {
  const lineBreak = between.lastIndexOf('\n');
  if (lineBreak < 0) {
    const spaces = /[ \t]*$/.exec(between)?.[0] ?? '';
    return `,${between.includes(',') ? spaces : oneLine}`;
  }
  const end = between.charAt(lineBreak - 1) === '\r' ? '\r\n' : '\n';
  const indent = /^[ \t]*/.exec(between.slice(lineBreak + 1))?.[0] ?? '';
  return `,${end}${indent}`;
}

/** The item at `item` to index `to`; the items between shift by one place. */
export function moveItemText(text: string, array: ArrayView, item: number, to: number): ListEdit {
  const { items } = array;
  const low = Math.min(item, to);
  const high = Math.max(item, to);
  const order = items.slice(low, high + 1).map((_, index) => low + index);
  order.splice(item - low, 1);
  order.splice(to - low, 0, item);
  const pieces: Piece[] = [];
  for (let place = low; place <= high; place += 1) {
    const source = items[order[place - low] ?? place];
    const here = items[place];
    const next = items[place + 1];
    if (source === undefined || here === undefined) continue;
    pieces.push(slice(text, source.span));
    if (place < high && next !== undefined) {
      pieces.push(slice(text, { start: here.span.end, end: next.span.start }));
    }
  }
  const first = items[low]?.span.start ?? 0;
  const last = items[high]?.span.end ?? first;
  return rebuild(text, { start: first, end: last }, pieces);
}

/** A copy of the item at `item` right after it, with a separator like the array's own. */
export function duplicateItemText(text: string, array: ArrayView, item: number): ListEdit {
  const { items, reader } = array;
  const self = items[item];
  if (self === undefined) return { text, moved: (old) => old };
  // A literal `key` of the item is made unique in the copy (spec 4d, goal 8).
  const copy: Piece = { text: copyText(text, array, self), from: null };
  const next = items[item + 1];
  const previous = items[item - 1];
  if (next !== undefined) {
    // In front of the next item: this item keeps its own separator and any comment after it.
    const between = text.slice(self.span.end, next.span.start);
    const at = { start: next.span.start, end: next.span.start };
    return rebuild(text, at, [copy, { text: separatorLike(between), from: null }]);
  }
  const lead =
    previous === undefined
      ? text.slice(reader.tokens[array.open]?.end ?? self.span.start, self.span.start)
      : text.slice(previous.span.end, self.span.start);
  const at = { start: self.span.end, end: self.span.end };
  return rebuild(text, at, [{ text: separatorLike(lead), from: null }, copy]);
}

/**
 * The item at `item` taken out with one separator: the one after it, or before the last item the
 * one before it, so a trailing comma stays. The only item leaves `[]`.
 */
export function removeItemText(text: string, array: ArrayView, item: number): ListEdit {
  const { items, reader } = array;
  const self = items[item];
  if (self === undefined) return { text, moved: (old) => old };
  const next = items[item + 1];
  const previous = items[item - 1];
  const range: Span =
    next !== undefined
      ? { start: self.span.start, end: next.span.start }
      : previous !== undefined
        ? { start: previous.span.end, end: self.span.end }
        : {
            start: reader.tokens[array.open]?.end ?? self.span.start,
            end: reader.tokens[array.close]?.start ?? self.span.end,
          };
  return rebuild(text, range, []);
}
