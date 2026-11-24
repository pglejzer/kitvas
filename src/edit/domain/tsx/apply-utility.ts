// One utility class in an element's literal `className` (spec 4c, goal 2; Tailwind drafts): added
// after the last class, taken out, or swapped in its place. Every other class and every space
// between them stays as written. An added class goes with exactly one space in front, and taking
// the last class out takes the space in front of it, so the two undo each other byte for byte;
// so do a new `className` attribute and the removal of its only class. A class taken out of the
// middle is put back by the request's own hunks (`style-checks.ts`), since an op adds at the end.

import type { EditOp } from '../ops.ts';
import { knownUtility } from '../style/utilities.ts';
import type { ApplyResult, Refusal, Span } from '../types.ts';
import { isSpace, type Open, written } from './tsx-reader.ts';

export type UtilityOp = Extract<EditOp, { op: 'setUtility' }>;

type Token = { name: string; start: number; end: number };

const refuse = (refused: Refusal): ApplyResult => ({ refused });
const CONFLICT: ApplyResult = { conflict: 'changed' };

function splice(text: string, span: Span, insert: string): ApplyResult {
  return {
    text: text.slice(0, span.start) + insert + text.slice(span.end),
    changed: [{ start: span.start, end: span.start + insert.length }],
  };
}

/** The classes of a `className` string whose inside starts at `from`, with their places. */
function classesOf(value: string, from: number): Token[] {
  return [...value.matchAll(/\S+/g)].map((match) => {
    const start = from + (match.index ?? 0);
    return { name: match[0], start, end: start + match[0].length };
  });
}

/** Where the whitespace in front of `end` starts, never before `floor`. */
function spaceStart(text: string, end: number, floor: number): number {
  let start = end;
  while (start > floor && isSpace(text.charAt(start - 1))) start -= 1;
  return start;
}

/** A new `className` attribute right after the tag name, set off as the tag's first attribute is. */
function insertAttribute(text: string, open: Open, value: string): ApplyResult {
  const first = open.first ?? open.nameEnd;
  const start = spaceStart(text, first, open.nameEnd);
  const lead = start === first ? ' ' : text.slice(start, first);
  return splice(text, { start: open.nameEnd, end: open.nameEnd }, `${lead}className="${value}"`);
}

/** The class without the space that set it off: the one after it, or before it for the last. */
function removeClass(text: string, tokens: readonly Token[], hit: Token): ApplyResult {
  const at = tokens.indexOf(hit);
  const next = tokens[at + 1];
  if (next !== undefined) return splice(text, { start: hit.start, end: next.start }, '');
  const previous = tokens[at - 1];
  return splice(text, { start: previous?.end ?? hit.start, end: hit.end }, '');
}

/**
 * Applies a `setUtility` to the tag `open`. A `className` built in code is refused (`computed`), a
 * class kitvas does not know (`utility-unknown`), and so is a class that would then stand twice.
 */
export function applyUtility(text: string, open: Open, op: UtilityOp, force: boolean): ApplyResult {
  const { value, before } = op;
  if (value === null && before === null) return refuse('invalid');
  if (value !== null && !knownUtility(value)) return refuse('utility-unknown');
  const attrs = open.attrs.filter((attr) => attr.name === 'className');
  const attr = attrs[0];
  if (attrs.length > 1) return refuse('ambiguous');
  if (attr === undefined) {
    if (before !== null && !force) return CONFLICT;
    return value === null ? refuse('not-found') : insertAttribute(text, open, value);
  }
  const current = written(text, attr);
  if (current.kind !== 'string') return refuse('computed');
  const tokens = classesOf(current.value, current.inner.start);
  const named = (name: string): Token[] => tokens.filter((token) => token.name === name);

  const held = before === null ? [] : named(before);
  const hit = held[0];
  if (held.length > 1) return refuse('ambiguous');
  if (before !== null && hit === undefined && !force) return CONFLICT;
  if (hit !== undefined) {
    if (value === null) {
      // Its only class goes with the attribute, as a new attribute came with its first class.
      if (tokens.length > 1) return removeClass(text, tokens, hit);
      const start = spaceStart(text, attr.span.start, open.nameEnd);
      return splice(text, { start, end: attr.span.end }, '');
    }
    if (value === hit.name) return { text, changed: [] };
    return named(value).length > 0
      ? refuse('ambiguous')
      : splice(text, { start: hit.start, end: hit.end }, value);
  }
  if (value === null) return refuse('not-found');
  if (named(value).length > 0) return force ? { text, changed: [] } : CONFLICT;
  const last = tokens.at(-1);
  // An empty `className=""` would not come back when the class is taken out again.
  if (last === undefined) return refuse('utility-unknown');
  return splice(text, { start: last.end, end: last.end }, ` ${value}`);
}
