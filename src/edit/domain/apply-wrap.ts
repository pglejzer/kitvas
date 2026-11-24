// Wrap, unwrap and the two replaces of one TSX text (spec 4b, decisions 2, 5 and 9; plan 14,
// task A3). Pure: `apply-structure.ts` hands the located offsets on, and every change here is a
// list of splices, so the new text and the place of every old offset come from the same data.
//
// Wrap and unwrap are exact inverses of each other. Both have two forms, and each form of the one
// produces what the same form of the other reads:
// - on lines: the wrapped range starts its line and ends its line, so the new tags get lines of
//   their own and the range goes one indent unit deeper;
// - inline: anything else; the tags are written right around the range and no line changes.
// Lines that hold only whitespace are never touched, in either direction.

import type { Located, StructureResult, TreeOp } from './apply-structure.ts';
import { indentUnitOf, newlineOf, reindent } from './format.ts';
import { hashOf } from './ops.ts';
import { childrenOf, contextOf, elementSpan, parentOf } from './subtree.ts';
import { isSpace, readTag } from './tsx-reader.ts';
import type { ApplyOptions, OffsetMap, Refusal, Span } from './types.ts';

type WrapOp = Extract<TreeOp, { op: 'wrapElements' }>;
type UnwrapOp = Extract<TreeOp, { op: 'unwrapElement' }>;
type ReplaceOpenOp = Extract<TreeOp, { op: 'replaceOpen' }>;
type ReplaceElementOp = Extract<TreeOp, { op: 'replaceElement' }>;

/**
 * One change of the old text: `[start, end)` gives way to `insert`. An old offset inside the
 * range is gone (`null`), but with `keep` the range's first offset stays: the element that starts
 * there is still the same element (an opening tag swapped for another).
 */
type Splice = { start: number; end: number; insert: string; keep: boolean };

const refuse = (refused: Refusal): StructureResult => ({ refused });
const cut = (start: number, end: number): Splice => ({ start, end, insert: '', keep: false });
const put = (at: number, insert: string): Splice => ({ start: at, end: at, insert, keep: false });

/** Applies splices that do not overlap. What stood at an insertion point moves behind it. */
function applySplices(text: string, splices: Splice[], created: number[]): StructureResult {
  const sorted = [...splices].sort((a, b) => a.start - b.start);
  let result = '';
  let from = 0;
  for (const splice of sorted) {
    result += text.slice(from, splice.start) + splice.insert;
    from = splice.end;
  }
  result += text.slice(from);
  const moved: OffsetMap = (old) => {
    let shift = 0;
    for (const splice of sorted) {
      if (old < splice.start) break;
      if (old < splice.end) return splice.keep && old === splice.start ? old + shift : null;
      shift += splice.insert.length - (splice.end - splice.start);
    }
    return old + shift;
  };
  return { text: result, moved, created };
}

const lineStartOf = (text: string, at: number): number =>
  at <= 0 ? 0 : text.lastIndexOf('\n', at - 1) + 1;

/** The spaces and tabs the line of `at` starts with. */
function lineIndent(text: string, at: number): string {
  const start = lineStartOf(text, at);
  let end = start;
  while (text.charAt(end) === ' ' || text.charAt(end) === '\t') end += 1;
  return text.slice(start, end);
}

/** The indent before `at` when nothing else stands before it on its line, else `null`. */
function indentBefore(text: string, at: number): string | null {
  const lead = text.slice(lineStartOf(text, at), at);
  return /^[ \t]*$/.test(lead) ? lead : null;
}

/** Nothing but spaces and tabs between `at` and the end of its line. */
function endsLine(text: string, at: number): boolean {
  let i = at;
  while (text.charAt(i) === ' ' || text.charAt(i) === '\t') i += 1;
  return i >= text.length || text.charAt(i) === '\n' || text.startsWith('\r\n', i);
}

function isBlank(text: string, start: number, end: number): boolean {
  for (let i = start; i < end; i += 1) {
    if (!isSpace(text.charAt(i))) return false;
  }
  return true;
}

/**
 * Where each line after the first starts inside `[from, to)`, without the lines that hold only
 * whitespace. Wrap and unwrap both shift exactly these lines, which is what makes them inverses.
 */
function laterLines(text: string, from: number, to: number): number[] {
  const starts: number[] = [];
  let breakAt = text.indexOf('\n', from);
  while (breakAt >= 0 && breakAt + 1 < to) {
    const start = breakAt + 1;
    const next = text.indexOf('\n', start);
    if (!isBlank(text, start, next < 0 || next > to ? to : next)) starts.push(start);
    breakAt = next;
  }
  return starts;
}

type OpenSource = { source: string; name: string; selfClosing: boolean };

/** `open` when it reads as exactly one opening tag (the 4a reader decides), else `null`. */
function openSource(open: string): OpenSource | null {
  const source = open.trim();
  if (!source.startsWith('<')) return null;
  const view = readTag(source, 0);
  if (typeof view === 'string' || view.span.end !== source.length) return null;
  return { source, name: view.name, selfClosing: view.selfClosing };
}

/** The op's hash is not the hash of what stands there now; never with `force`. */
function changed(part: string, hash: string | undefined, options: ApplyOptions): boolean {
  return !options.force && hash !== undefined && hashOf(part) !== hash;
}

/** Written among the children of its parent: not a function's root and not a prop's value. */
function isChild(text: string, at: number): boolean {
  const parent = parentOf(text, at);
  if (parent === null) return false;
  const children = childrenOf(text, parent) ?? [];
  return children.some((child) => child.kind === 'element' && child.span.start === at);
}

/**
 * Puts the siblings from `at.first` to `at.last` into a new element whose opening tag is
 * `op.open`. `created`: the new element's `<`, which is where `first` stood.
 */
export function wrapElements(
  text: string,
  at: Located,
  op: WrapOp,
  options: ApplyOptions,
): StructureResult {
  if (at.first === undefined || at.last === undefined) return refuse('not-found');
  const first = elementSpan(text, at.first);
  const last = elementSpan(text, at.last);
  if (first === null || last === null) return refuse('not-found');
  if (first.start > last.start || last.end < first.end) return refuse('not-siblings');
  if (changed(text.slice(first.start, last.end), op.hash, options)) return { conflict: 'changed' };
  if (contextOf(text, first.start) === 'expression') return refuse('in-expression');
  if (contextOf(text, last.start) === 'expression') return refuse('in-expression');
  if (first.start !== last.start) {
    // The same parent is not enough: a prop's JSX has the element that writes the prop as its
    // parent too, so both must stand among that parent's children.
    const parent = parentOf(text, first.start);
    if (parent === null || parentOf(text, last.start) !== parent) return refuse('not-siblings');
    if (!isChild(text, first.start) || !isChild(text, last.start)) return refuse('not-siblings');
  }
  const open = openSource(op.open);
  if (open === null || open.selfClosing) return refuse('invalid');
  const close = `</${open.name}>`;
  const indent = indentBefore(text, first.start);
  if (indent === null || !endsLine(text, last.end)) {
    const splices = [put(first.start, open.source), put(last.end, close)];
    return applySplices(text, splices, [first.start]);
  }
  const newline = newlineOf(text);
  const unit = indentUnitOf(text);
  const splices = [put(first.start, `${open.source}${newline}${indent}${unit}`)];
  for (const start of laterLines(text, first.start, last.end)) splices.push(put(start, unit));
  splices.push(put(last.end, `${newline}${indent}${close}`));
  return applySplices(text, splices, [first.start]);
}

/**
 * Puts the children of the element at `at.target` in its place. A root with more than one child
 * keeps a parent, since a `return` and a prop take one element: its tags become `<>` and `</>`.
 */
export function unwrapElement(
  text: string,
  at: Located,
  op: UnwrapOp,
  options: ApplyOptions,
): StructureResult {
  if (at.target === undefined) return refuse('not-found');
  const span = elementSpan(text, at.target);
  const view = readTag(text, at.target);
  if (span === null || typeof view === 'string') return refuse('not-found');
  if (changed(text.slice(span.start, span.end), op.hash, options)) return { conflict: 'changed' };
  if (contextOf(text, span.start) === 'expression') return refuse('in-expression');
  const children = childrenOf(text, span.start) ?? [];
  const head = children[0];
  const tail = children[children.length - 1];
  if (head === undefined || tail === undefined) return refuse('no-element-children');
  if (head.kind !== 'element' || tail.kind !== 'element') return refuse('no-element-children');
  if (children.length > 1 && !isChild(text, span.start)) {
    const closeAt = closingTagAt(text, span, view.name);
    if (closeAt === null) return refuse('invalid');
    const splices = [
      { start: span.start, end: view.span.end, insert: '<>', keep: false },
      { start: closeAt.start, end: span.end, insert: '</>', keep: false },
    ];
    return applySplices(text, splices, []);
  }
  const from = head.span.start;
  const to = tail.span.end;
  const splices = [cut(span.start, from)];
  const indent = indentBefore(text, span.start);
  // On lines (see the top of the file): the children start on a line after the opening tag.
  if (indent !== null && text.slice(view.span.end, from).includes('\n')) {
    const childIndent = lineIndent(text, from);
    const deeper = childIndent.startsWith(indent) ? childIndent.slice(indent.length) : '';
    for (const start of deeper === '' ? [] : laterLines(text, from, to)) {
      if (text.startsWith(deeper, start)) splices.push(cut(start, start + deeper.length));
    }
  }
  splices.push(cut(to, span.end));
  return applySplices(text, splices, []);
}

type Closing = { start: number; name: Span };

/** The closing tag of the element `span` and where its name is written; `null` when unreadable. */
function closingTagAt(text: string, span: Span, name: string): Closing | null {
  const start = text.lastIndexOf('</', span.end - 1);
  if (start < span.start) return null;
  let nameStart = start + 2;
  while (nameStart < span.end && isSpace(text.charAt(nameStart))) nameStart += 1;
  if (!text.startsWith(name, nameStart)) return null;
  return { start, name: { start: nameStart, end: nameStart + name.length } };
}

/**
 * Swaps the opening tag of the element at `at.target` for `op.open`, and the closing tag's name
 * with it. The children stay as written. The element is still the same one: its `<` keeps its
 * place in `moved`.
 */
export function replaceOpen(
  text: string,
  at: Located,
  op: ReplaceOpenOp,
  options: ApplyOptions,
): StructureResult {
  if (at.target === undefined) return refuse('not-found');
  const span = elementSpan(text, at.target);
  const view = readTag(text, at.target);
  if (span === null || typeof view === 'string') return refuse('not-found');
  if (changed(text.slice(span.start, span.end), op.hash, options)) return { conflict: 'changed' };
  if (contextOf(text, span.start) === 'expression') return refuse('in-expression');
  const open = openSource(op.open);
  if (open === null) return refuse('invalid');
  const whole = (insert: string, end: number): Splice => ({
    start: span.start,
    end,
    insert,
    keep: true,
  });
  if (view.selfClosing) {
    // It had no closing tag; one that now opens gets the tag that closes it.
    const insert = open.selfClosing ? open.source : `${open.source}</${open.name}>`;
    return applySplices(text, [whole(insert, span.end)], []);
  }
  if (open.selfClosing) {
    // A tag that closes itself has no room for children; an empty element may become one.
    if (!isBlank(text, view.span.end, closingStart(text, span, view.name))) {
      return refuse('not-accepted');
    }
    return applySplices(text, [whole(open.source, span.end)], []);
  }
  const close = closingTagAt(text, span, view.name);
  if (close === null) return refuse('invalid');
  const name = { start: close.name.start, end: close.name.end, insert: open.name, keep: false };
  return applySplices(text, [whole(open.source, view.span.end), name], []);
}

/** Where the closing tag starts, or the element's end when it cannot be read (never blank then). */
function closingStart(text: string, span: Span, name: string): number {
  return closingTagAt(text, span, name)?.start ?? span.end;
}

/** The indent of a multi-line element's source: that of its last line, which holds its end. */
function baseIndentOf(source: string): string {
  return lineIndent(source, source.length);
}

/**
 * Replaces the whole element at `at.target` by `op.source` (one element or one fragment), with
 * the file's newline and re-indented to where the element stood. Everything inside the old
 * element is gone from `moved`; `created`: the new element's `<`.
 */
export function replaceElement(
  text: string,
  at: Located,
  op: ReplaceElementOp,
  options: ApplyOptions,
): StructureResult {
  if (at.target === undefined) return refuse('not-found');
  const span = elementSpan(text, at.target);
  if (span === null) return refuse('not-found');
  if (changed(text.slice(span.start, span.end), op.hash, options)) return { conflict: 'changed' };
  if (contextOf(text, span.start) === 'expression') return refuse('in-expression');
  const raw = op.source.trim().replace(/\r?\n/g, newlineOf(text));
  const whole = elementSpan(raw, 0);
  if (whole === null || whole.start !== 0 || whole.end !== raw.length) return refuse('invalid');
  const source = raw.includes('\n')
    ? reindent(raw, baseIndentOf(raw), lineIndent(text, span.start))
    : raw;
  const splice = { start: span.start, end: span.end, insert: source, keep: false };
  return applySplices(text, [splice], [span.start]);
}
