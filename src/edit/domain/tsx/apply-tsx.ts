// The TSX side of the editor's write-back: the edits of one JSX tag's props, class and text
// (spec 4a, decision 5). The tag is read by `tsx-reader.ts`; its public functions are handed on
// from here, so the rest of the module has one file to import.
//
// Every edit replaces one span and leaves every other byte alone, which is what makes an
// operation and its inverse exact.

import type { TailwindTheme } from '../../../shared/values/tailwind-file.ts';
import type { EditOp, PropValue } from '../ops.ts';
import { themeOrDefault } from '../style/utilities.ts';
import type { ApplyOptions, ApplyResult, Refusal } from '../types.ts';
import { applyUtility, spaceStart, splice } from './apply-utility.ts';
import {
  type Attr,
  type Open,
  openAt,
  plainText,
  trimSpan,
  type Written,
  written,
} from './tsx-reader.ts';

export { offsetOf, openingTags, readTag } from './tsx-reader.ts';

export type TsxOp = Extract<
  EditOp,
  { op: 'setProp' | 'removeProp' | 'setText' | 'addClass' | 'removeClass' | 'setUtility' }
>;
type PropOp = Extract<TsxOp, { op: 'setProp' | 'removeProp' }>;

/**
 * `tailwind`: the project's Tailwind facts a utility class is checked against (plan 29); none:
 * Tailwind 4 with no prefix and its own screens.
 */
export type TsxOptions = ApplyOptions & { tailwind?: TailwindTheme | undefined };

const refuse = (refused: Refusal): ApplyResult => ({ refused });
const CONFLICT: ApplyResult = { conflict: 'changed' };

/**
 * What goes in front of a new attribute: the whitespace in front of the tag's first one, so a
 * tag with one prop per line gets a new line with the same indent; one space without any.
 */
function separator(text: string, open: Open): string {
  if (open.first === null) return ' ';
  const start = spaceStart(text, open.first, open.nameEnd);
  return start === open.first ? ' ' : text.slice(start, open.first);
}

const insertAttr = (text: string, open: Open, at: number, source: string): ApplyResult =>
  splice(text, { start: at, end: at }, separator(text, open) + source);

/** The attribute goes with the whitespace in front of it, which undoes an insert exactly. */
const removeAttr = (text: string, open: Open, attr: Attr): ApplyResult =>
  splice(text, { start: spaceStart(text, attr.span.start, open.nameEnd), end: attr.span.end }, '');

/** `preferred` unless the value holds it; `null` when the value holds both quotes. */
function quoteFor(value: string, preferred: string): string | null {
  if (!value.includes(preferred)) return preferred;
  const other = preferred === '"' ? "'" : '"';
  return value.includes(other) ? null : other;
}

/** A whole prop as kitvas writes it; `null` when the value cannot be written. */
function propSource(name: string, value: PropValue): string | null {
  if (value.kind === 'boolean') return value.value ? name : `${name}={false}`;
  if (value.kind === 'number') {
    return Number.isFinite(value.value) ? `${name}={${String(value.value)}}` : null;
  }
  const quote = quoteFor(value.value, '"');
  return quote === null ? null : `${name}=${quote}${value.value}${quote}`;
}

function holds(current: Written, before: PropValue | null): boolean {
  if (before === null || current.kind === 'expr') return false;
  return current.kind === before.kind && current.value === before.value;
}

/** The attribute `name`: `null` when the tag does not write it, `ambiguous` when it does twice. */
function attrOf(open: Open, name: string): Attr | null | 'ambiguous' {
  const found = open.attrs.filter((attr) => attr.name === name);
  return found.length > 1 ? 'ambiguous' : (found[0] ?? null);
}

function editProp(text: string, open: Open, op: PropOp, force: boolean): ApplyResult {
  const attr = attrOf(open, op.name);
  if (attr === 'ambiguous') return refuse('ambiguous');
  if (attr === null) {
    // A spread may set the prop, and then a prop written beside it would not be the whole truth.
    if (open.spread) return refuse('spread');
    if (op.before !== null && !force) return CONFLICT;
    return op.op === 'removeProp' ? refuse('not-found') : insertProp(text, open, op);
  }
  const current = written(text, attr);
  if (current.kind === 'expr') return refuse('computed');
  if (!force && !holds(current, op.before)) return CONFLICT;
  if (op.op === 'removeProp') return removeAttr(text, open, attr);

  const { value } = op;
  if (current.kind === 'string' && value.kind === 'string') {
    const quote = quoteFor(value.value, current.quote);
    if (quote === null) return refuse('invalid');
    // The same quote: only the characters between the quotes change.
    if (quote === current.quote) return splice(text, current.inner, value.value);
  } else if (current.kind === 'number' && value.kind === 'number') {
    if (!Number.isFinite(value.value)) return refuse('invalid');
    return splice(text, current.inner, String(value.value));
  }
  // Another kind, or another quote: the prop's own span is written again.
  const source = propSource(op.name, value);
  return source === null ? refuse('invalid') : splice(text, attr.span, source);
}

function insertProp(text: string, open: Open, op: Extract<TsxOp, { op: 'setProp' }>): ApplyResult {
  const source = propSource(op.name, op.value);
  if (source === null) return refuse('invalid');
  if (op.after === null) return insertAttr(text, open, open.nameEnd, source);
  const anchor = attrOf(open, op.after);
  if (anchor === 'ambiguous') return refuse('ambiguous');
  return anchor === null ? refuse('not-found') : insertAttr(text, open, anchor.span.end, source);
}

function setText(
  text: string,
  open: Open,
  op: Extract<TsxOp, { op: 'setText' }>,
  force: boolean,
): ApplyResult {
  const found = plainText(text, open);
  if (found === null) return refuse('no-text');
  const { value } = op;
  // Whitespace at the ends would not be read back as the text, and an empty text is no text.
  const kept = trimSpan(value, { start: 0, end: value.length });
  if (value === '' || kept.end - kept.start !== value.length || /[{}<>\r\n]/.test(value)) {
    return refuse('invalid');
  }
  if (!force && found.value !== op.before) return CONFLICT;
  return splice(text, found.span, value);
}

/**
 * Applies one operation to the tag at `at` (the offset of its `<`). The answer is the whole new
 * text with the span that changed, or a refusal or a conflict with no text at all.
 */
export function applyTsx(text: string, at: number, op: TsxOp, options: TsxOptions): ApplyResult {
  const open = openAt(text, at);
  if (open === null) return refuse('not-found');
  switch (op.op) {
    case 'setUtility': {
      const tailwind = themeOrDefault(options.tailwind);
      return applyUtility(text, open, op, { force: options.force, tailwind });
    }
    case 'setProp':
    case 'removeProp':
      return editProp(text, open, op, options.force);
    case 'setText':
      return setText(text, open, op, options.force);
    case 'addClass': {
      if (open.attrs.some((attr) => attr.name === 'className')) return refuse('has-class');
      return insertAttr(text, open, open.nameEnd, `className="${op.className}"`);
    }
    case 'removeClass': {
      const attr = attrOf(open, 'className');
      if (attr === null || attr === 'ambiguous') return refuse('not-found');
      const current = written(text, attr);
      const exact = current.kind === 'string' && current.value === op.className;
      return exact ? removeAttr(text, open, attr) : refuse('not-found');
    }
  }
}
