// Structural changes of one TSX text (spec 4b, decisions 2, 5 and 9; plan 14, tasks A2 and A3).
// Pure: the app finds the elements an op names in the current text and passes their offsets;
// this file splices subtrees, keeps the file's newline and indent unit, and says where every old
// offset went, so the rename map and the hunks of the inverse can be made from it.
//
// Move, insert and remove are here; wrap, unwrap and the two replaces are in `apply-wrap.ts`.
// A removal and an insertion at the same place are each other's exact inverse: the removal takes
// the element with the whitespace that set it apart, and the insertion reads from what stands
// around the place which whitespace that was.

import { hashOf, type Place } from '../ops.ts';
import {
  endsLine,
  indentAt,
  indentUnitOf,
  isBlank,
  lineEndOf,
  lineStartOf,
  newlineOf,
  reindent,
  reindented,
  sourceIndent,
  startsLine,
  withNewline,
} from '../tsx/format.ts';
import { isSpace, openAt } from '../tsx/tsx-reader.ts';
import type { ApplyOptions, OffsetMap, Refusal, Span } from '../types.ts';
import { replaceElement, replaceOpen, unwrapElement, wrapElements } from './apply-wrap.ts';
import { childrenOf, contextOf, elementSpan, isMixed, parentOf } from './subtree.ts';

/**
 * The element ops once the app has resolved them to exact source: `replaceTag` arrives as
 * `replaceOpen` (the new opening tag, built from the catalog), `resetElement` and a paste over as
 * `replaceElement`. A move or insert into another file arrives as `removeElement` in one text and
 * `insertElement` in the other. `hash`: the subtree as the editor saw it (decision 5).
 */
export type TreeOp =
  | { op: 'moveElement'; place: Place; hash?: string | undefined }
  | { op: 'insertElement'; place: Place; source: string }
  | { op: 'removeElement'; hash?: string | undefined }
  | { op: 'wrapElements'; open: string; hash?: string | undefined }
  | { op: 'unwrapElement'; hash?: string | undefined }
  | { op: 'replaceOpen'; open: string; hash?: string | undefined }
  | { op: 'replaceElement'; source: string; hash?: string | undefined };

/**
 * The `<` of each element the op names, in the current text: `target` (the element moved,
 * removed, unwrapped or replaced), `anchor` (where a move or insert goes), `first` and `last` (the
 * siblings a wrap takes). `hash` of a wrap is over the text from `first` to the end of `last`.
 */
export type Located = { target?: number; anchor?: number; first?: number; last?: number };

/**
 * Applied: the new text, where each old offset went (`null` inside what was removed), and the `<`
 * of each element the op created, in the new text (an insert's top elements, a wrap's new parent).
 */
export type StructureResult =
  | { text: string; moved: OffsetMap; created: number[] }
  | { refused: Refusal }
  | { conflict: 'changed' };

type Stopped = Exclude<StructureResult, { text: string }>;
/** An element's tags: where its opening tag ends and its closing tag starts. */
type Frame = { at: number; openEnd: number; closeStart: number; end: number; selfClosing: boolean };
/**
 * Where a source goes: `lead + source + trail` at `at`. `indent`: the depth its later lines are
 * shifted to. `prev`: where the thing in front of the place ends (a sibling, or the opening tag).
 */
type Slot = { at: number; lead: string; trail: string; indent: string; prev: number };
/** The element a move or a removal takes, and all it takes from the text. */
type Taken = { span: Span; cut: Span };

const refuse = (refused: Refusal): Stopped => ({ refused });

function frameOf(text: string, at: number): Frame | null {
  const span = elementSpan(text, at);
  if (span === null) return null;
  const fragment = text.startsWith('<>', at);
  const open = fragment ? null : openAt(text, at);
  if (!fragment && open === null) return null;
  const openEnd = open === null ? at + 2 : open.end;
  const selfClosing = open?.selfClosing ?? false;
  const closeStart = selfClosing ? span.end : text.lastIndexOf('</', span.end);
  if (closeStart < openEnd) return null;
  return { at, openEnd, closeStart, end: span.end, selfClosing };
}

function spaceStart(text: string, at: number, floor: number): number {
  let start = at;
  while (start > floor && isSpace(text.charAt(start - 1))) start -= 1;
  return start;
}

function spaceEnd(text: string, at: number, ceiling: number): number {
  let end = at;
  while (end < ceiling && isSpace(text.charAt(end))) end += 1;
  return end;
}

const isChild = (text: string, parent: number, at: number): boolean =>
  (childrenOf(text, parent) ?? []).some(
    (child) => child.kind === 'element' && child.span.start === at,
  );

/**
 * Why the element at `at` has no place of its own among a parent's children: it is what a
 * function returns, a prop's value, or written inside a `{…}` child. `null`: it is a plain child,
 * so it can be taken out and a sibling can stand beside it.
 */
function siteOf(text: string, at: number): Refusal | null {
  const context = contextOf(text, at);
  if (context === 'expression') return 'in-expression';
  const parent = parentOf(text, at);
  if (parent === null) return context === 'slot' ? 'slot-root' : 'section-root';
  const frame = frameOf(text, parent);
  if (frame === null) return 'not-found';
  // Inside the parent's opening tag: the JSX of one of its props.
  if (at < frame.openEnd) return 'slot-root';
  return isChild(text, parent, at) ? null : 'in-expression';
}

/** The root of the prop JSX the element at `at` is written in (itself, when it is one). */
function slotOf(text: string, at: number): number | null {
  let current = at;
  for (let depth = 0; depth < 1_000; depth += 1) {
    const parent = parentOf(text, current);
    const frame = parent === null ? null : frameOf(text, parent);
    if (parent === null || frame === null) return null;
    if (current < frame.openEnd) return current;
    current = parent;
  }
  return null;
}

/** On a line of its own after `prev`, which only blanks follow on its line. */
function ownLine(text: string, prev: number, indent: string): Slot {
  return { at: lineEndOf(text, prev), lead: newlineOf(text) + indent, trail: '', indent, prev };
}

/**
 * On the line of `prev`, one space from its siblings and none from its parent's tags: after a
 * sibling `<A /> <B />`, first of several `<P><B /> <A /></P>`, alone `<P><B /></P>`. Where the
 * parent already starts with a space, that space is repeated in front instead.
 */
function inline(text: string, parent: Frame, prev: number): Slot {
  const slot = { at: prev, trail: '', indent: indentAt(text, prev), prev };
  if (prev > parent.openEnd) return { ...slot, lead: ' ' };
  const next = spaceEnd(text, prev, parent.closeStart);
  if (next > prev) return { ...slot, lead: ' ' };
  return { ...slot, lead: '', trail: next < parent.closeStart ? ' ' : '' };
}

/** As the first or the last child of `anchor`. */
function inside(text: string, anchor: Frame, place: Place): Slot {
  const { openEnd, closeStart } = anchor;
  const first = spaceEnd(text, openEnd, closeStart);
  if (first === closeStart) {
    // No children. Tags on two lines take the child between them, one unit deeper.
    if (!text.slice(openEnd, closeStart).includes('\n')) return inline(text, anchor, openEnd);
    return ownLine(text, openEnd, indentAt(text, closeStart) + indentUnitOf(text));
  }
  if (place === 'first') {
    if (!startsLine(text, first)) return inline(text, anchor, openEnd);
    return ownLine(text, openEnd, indentAt(text, first));
  }
  const prev = spaceStart(text, closeStart, openEnd);
  if (!text.slice(prev, closeStart).includes('\n')) return inline(text, anchor, prev);
  const children = childrenOf(text, anchor.at) ?? [];
  const last = children[children.length - 1];
  const start = last === undefined ? prev : spaceEnd(text, last.span.start, last.span.end);
  const indent = startsLine(text, start)
    ? indentAt(text, start)
    : indentAt(text, closeStart) + indentUnitOf(text);
  return ownLine(text, prev, indent);
}

/** As the sibling before or after `anchor`, a child of `parent`. */
function beside(text: string, anchor: Frame, parent: Frame, place: Place): Slot {
  if (place === 'after') {
    const alone = startsLine(text, anchor.at) && endsLine(text, anchor.end);
    return alone
      ? ownLine(text, anchor.end, indentAt(text, anchor.at))
      : inline(text, parent, anchor.end);
  }
  const prev = spaceStart(text, anchor.at, parent.openEnd);
  if (!startsLine(text, anchor.at)) return inline(text, parent, prev);
  // A line of its own in front of the anchor's line: the same bytes as a new line after the
  // sibling before it, and right when the anchor is the first child too.
  const indent = indentAt(text, anchor.at);
  const at = lineStartOf(text, anchor.at);
  return { at, lead: indent, trail: newlineOf(text), indent, prev };
}

/** The place an op names, or why nothing may go there (rule 2 of task A2). */
function destination(text: string, anchor: Frame, place: Place): Slot | Refusal {
  const site = siteOf(text, anchor.at);
  if (place === 'first' || place === 'last') {
    // A root and a prop's JSX take children like any element; an expression's element does not.
    if (site === 'in-expression' || site === 'not-found') return site;
    // Opening `<X />` is the app's call: only the catalog knows whether X takes children.
    if (anchor.selfClosing) return 'not-accepted';
    return isMixed(text, anchor.at) ? 'mixed' : inside(text, anchor, place);
  }
  if (site !== null) return site;
  const parentAt = parentOf(text, anchor.at);
  const parent = parentAt === null ? null : frameOf(text, parentAt);
  if (parent === null) return 'not-found';
  return isMixed(text, parent.at) ? 'mixed' : beside(text, anchor, parent, place);
}

/**
 * All a removal takes. An element alone on its line(s) goes with the line break and the indent in
 * front of it, so its line goes. Else it goes with the whitespace in front of it; and the first of
 * several children on one line, which has none, with the blanks after it (`<P><B /> <A /></P>`).
 */
function cutOf(text: string, span: Span, parent: Frame): Span {
  const lineStart = lineStartOf(text, span.start);
  if (lineStart > 0 && startsLine(text, span.start) && endsLine(text, span.end)) {
    const feed = lineStart - 1;
    return { start: text.charAt(feed - 1) === '\r' ? feed - 1 : feed, end: span.end };
  }
  const before = spaceStart(text, span.start, parent.openEnd);
  if (before < span.start) return { start: before, end: span.end };
  let after = span.end;
  while (isBlank(text.charAt(after))) after += 1;
  const sibling = after > span.end && after < parent.closeStart && !isSpace(text.charAt(after));
  return { start: span.start, end: before === parent.openEnd && sibling ? after : span.end };
}

/** The element a move or a removal names, checked: it is there, as the editor saw it, and free. */
function take(
  text: string,
  target: number | undefined,
  hash: string | undefined,
  options: ApplyOptions,
): Taken | Stopped {
  const span = target === undefined ? null : elementSpan(text, target);
  if (span === null) return refuse('not-found');
  const changed = hash !== undefined && hashOf(text.slice(span.start, span.end)) !== hash;
  if (changed && !options.force) return { conflict: 'changed' };
  const site = siteOf(text, span.start);
  if (site !== null) return refuse(site);
  const parentAt = parentOf(text, span.start);
  const parent = parentAt === null ? null : frameOf(text, parentAt);
  if (parent === null) return refuse('not-found');
  return { span, cut: cutOf(text, span, parent) };
}

function remove(text: string, taken: Taken): StructureResult {
  const { start, end } = taken.cut;
  return {
    text: text.slice(0, start) + text.slice(end),
    moved: (old) => (old < start ? old : old < end ? null : old - (end - start)),
    created: [],
  };
}

function insert(text: string, at: Located, place: Place, written: string): StructureResult {
  const anchor = at.anchor === undefined ? null : frameOf(text, at.anchor);
  if (anchor === null) return refuse('not-found');
  const source = withNewline(written.trim(), newlineOf(text));
  // One element or one fragment, whole: anything else would not be one child.
  const whole = elementSpan(source, 0);
  if (whole === null || whole.end !== source.length) return refuse('invalid');
  const slot = destination(text, anchor, place);
  if (typeof slot === 'string') return refuse(slot);
  const added = slot.lead + reindent(source, sourceIndent(source), slot.indent) + slot.trail;
  const next = text.slice(0, slot.at) + added + text.slice(slot.at);
  const start = slot.at + slot.lead.length;
  // A fragment has no id of its own: what it created are the elements it holds.
  const created = source.startsWith('<>')
    ? (childrenOf(next, start) ?? [])
        .filter((child) => child.kind === 'element')
        .map((child) => child.span.start)
    : [start];
  return { text: next, moved: (old) => (old < slot.at ? old : old + added.length), created };
}

function move(text: string, at: Located, place: Place, taken: Taken): StructureResult {
  const { span, cut } = taken;
  const anchor = at.anchor === undefined ? null : frameOf(text, at.anchor);
  if (anchor === null) return refuse('not-found');
  if (anchor.at >= span.start && anchor.at < span.end) return refuse('into-self');
  const slot = destination(text, anchor, place);
  if (typeof slot === 'string') return refuse(slot);
  // Nothing moves into or out of a prop's JSX (decision 6); inside one, moves are free.
  if (slotOf(text, span.start) !== slotOf(text, anchor.at)) return refuse('slot-root');
  // Already there: the element is the thing right before the place, or right after it.
  if (slot.prev === span.end || slot.prev === spaceStart(text, span.start, 0)) {
    return { text, moved: (old) => old, created: [] };
  }
  // The place is read from the text as it is, so it must not lie in what the removal takes.
  if (slot.at > cut.start && slot.at < cut.end) return refuse('invalid');

  const source = text.slice(span.start, span.end);
  const from = startsLine(text, span.start) ? indentAt(text, span.start) : sourceIndent(source);
  const body = reindented(source, from, slot.indent);
  const added = slot.lead + body.text + slot.trail;
  const size = cut.end - cut.start;
  const early = slot.at <= cut.start;
  const next = early
    ? text.slice(0, slot.at) + added + text.slice(slot.at, cut.start) + text.slice(cut.end)
    : text.slice(0, cut.start) + text.slice(cut.end, slot.at) + added + text.slice(slot.at);
  const start = (early ? slot.at : slot.at - size) + slot.lead.length;
  const moved: OffsetMap = (old) => {
    if (old >= span.start && old < span.end) return start + body.at(old - span.start);
    if (old >= cut.start && old < cut.end) return null;
    return old + (old >= slot.at ? added.length : 0) - (old >= cut.end ? size : 0);
  };
  return { text: next, moved, created: [] };
}

/** Task A2: `moveElement`, `insertElement`, `removeElement`. Task A3: the other four. */
export function applyStructure(
  text: string,
  at: Located,
  op: TreeOp,
  options: ApplyOptions,
): StructureResult {
  switch (op.op) {
    case 'insertElement':
      return insert(text, at, op.place, op.source);
    case 'moveElement':
    case 'removeElement': {
      const taken = take(text, at.target, op.hash, options);
      if (!('span' in taken)) return taken;
      return op.op === 'removeElement' ? remove(text, taken) : move(text, at, op.place, taken);
    }
    case 'wrapElements':
      return wrapElements(text, at, op, options);
    case 'unwrapElement':
      return unwrapElement(text, at, op, options);
    case 'replaceOpen':
      return replaceOpen(text, at, op, options);
    case 'replaceElement':
      return replaceElement(text, at, op, options);
  }
}
