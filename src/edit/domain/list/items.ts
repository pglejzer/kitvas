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

/** One range of the text and what stands there afterwards. */
type Change = { range: Span; pieces: readonly Piece[] };

/**
 * Each range of `text` replaced by its pieces, in one edit; the ranges do not overlap. An old
 * offset inside a range follows the piece it was copied into, in whichever range that piece now
 * stands (`null`: it was removed); one outside them shifts by the ranges before it.
 */
function rebuildAll(text: string, changes: readonly Change[]): ListEdit {
  const sorted = [...changes].sort((a, b) => a.range.start - b.range.start);
  const placed: { from: number; to: number; length: number }[] = [];
  const shifts: { range: Span; shift: number }[] = [];
  let out = '';
  let cursor = 0;
  for (const { range, pieces } of sorted) {
    out += text.slice(cursor, range.start);
    const start = out.length;
    let body = '';
    for (const piece of pieces) {
      if (piece.from !== null) {
        placed.push({ from: piece.from, to: start + body.length, length: piece.text.length });
      }
      body += piece.text;
    }
    out += body;
    shifts.push({ range, shift: body.length - (range.end - range.start) });
    cursor = range.end;
  }
  out += text.slice(cursor);
  const moved: OffsetMap = (old) => {
    let shift = 0;
    for (const one of shifts) {
      if (old < one.range.start) break;
      if (old < one.range.end) {
        const hit = placed.find((place) => place.from <= old && old < place.from + place.length);
        return hit === undefined ? null : hit.to + (old - hit.from);
      }
      shift += one.shift;
    }
    return old + shift;
  };
  return { text: out, moved };
}

/** `range` of `text` replaced by `pieces`; old offsets follow the piece they were copied into. */
const rebuild = (text: string, range: Span, pieces: readonly Piece[]): ListEdit =>
  rebuildAll(text, [{ range, pieces }]);

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
  const range = removalOf(array, item);
  return range === null ? { text, moved: (old) => old } : rebuild(text, range, []);
}

/** What leaves the text with the item at `item`; `null` when the array has no such item. */
function removalOf(array: ArrayView, item: number): Span | null {
  const { items } = array;
  const self = items[item];
  if (self === undefined) return null;
  const next = items[item + 1];
  const previous = items[item - 1];
  if (next !== undefined) return { start: self.span.start, end: next.span.start };
  if (previous !== undefined) return { start: previous.span.end, end: self.span.end };
  return insideOf(array, self.span);
}

/** Between the array's brackets; `fallback` when a bracket's token is not there. */
function insideOf(array: ArrayView, fallback: Span): Span {
  const { reader } = array;
  return {
    start: reader.tokens[array.open]?.end ?? fallback.start,
    end: reader.tokens[array.close]?.start ?? fallback.end,
  };
}

/** Where `moved`, an item of another array, goes to stand at `place` among `array`'s items. */
function arrivalOf(text: string, array: ArrayView, place: number, moved: Piece): Change | null {
  const { items } = array;
  const count = items.length;
  const first = items[0];
  if (first === undefined) {
    // An empty array: right after its `[`, so a comment inside it stays.
    const { start } = insideOf(array, { start: -1, end: -1 });
    return start < 0 ? null : { range: { start, end: start }, pieces: [moved] };
  }
  // What the array writes before its first item, and between two of its items.
  const lead = text.slice(insideOf(array, first.span).start, first.span.start);
  const between = (left: number): string => {
    const a = items[left];
    const b = items[left + 1];
    return a === undefined || b === undefined ? lead : text.slice(a.span.end, b.span.start);
  };
  const here = items[place];
  if (here !== undefined) {
    // In front of the item that stands there: that item keeps its own separator.
    const like = place > 0 ? between(place - 1) : between(0);
    const at = { start: here.span.start, end: here.span.start };
    return { range: at, pieces: [moved, { text: separatorLike(like), from: null }] };
  }
  const last = items[count - 1];
  if (place !== count || last === undefined) return null;
  // After the last item: a trailing comma stays behind the new last one.
  const like = count > 1 ? between(count - 2) : lead;
  const at = { start: last.span.end, end: last.span.end };
  return { range: at, pieces: [{ text: separatorLike(like), from: null }, moved] };
}

/**
 * The item at `item` of `from` taken out as `removeItemText` takes it, and put into `to`, another
 * array of the file, at `place` among that array's items as they are (its length: last). One edit
 * of the text, so one inverse puts both arrays back. The item's text is moved as written; the
 * separator it gets is like the ones `to` writes. `null` when either place is not there.
 */
export function moveAcrossText(
  text: string,
  from: ArrayView,
  item: number,
  to: ArrayView,
  place: number,
): ListEdit | null {
  const self = from.items[item];
  const leaving = removalOf(from, item);
  if (self === undefined || leaving === null) return null;
  const arriving = arrivalOf(text, to, place, slice(text, self.span));
  if (arriving === null) return null;
  return rebuildAll(text, [{ range: leaving, pieces: [] }, arriving]);
}
