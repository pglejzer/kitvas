// Where an element of a data list stands (spec 4c, goal 9; plan 16, task D): the stretches of
// JavaScript from the file down to the element, and the `.map` callback whose returned JSX holds
// it. Pure and parser-free, like `subtree.ts`: it reads the tokens of the 4a scanner
// (`tsx-reader.ts`), which already skips strings, templates, comments and whole JSX elements.

import { childrenOf } from '../structure/subtree.ts';
import { type JsToken, jsTokens, openAt } from '../tsx/tsx-reader.ts';
import type { Span } from '../types.ts';

/** The tokens of one stretch of JavaScript, read against the file's text. */
export type Reader = { text: string; tokens: readonly JsToken[] };

/** One stretch of JavaScript on the way to the element: the file, or a `{…}` inside JSX. */
export type Region = Reader & {
  /** The whole file, or the `{…}` with its braces. */
  span: Span;
  /** The index in `tokens` of the JSX that holds the element. */
  root: number;
};

/** A parameter list's tokens without its parentheses: `[from, to)`. */
export type Params = { from: number; to: number };

/** A `.map` call whose callback returns the JSX that holds the element. */
export type Callback = {
  /** The `.` before `map`. */
  dot: number;
  /** The `(` that opens the call. */
  call: number;
  params: Params;
};

type Made = { start: number; params: Params };

const OPENERS = '([{';
const CLOSERS = ')]}';
/** Calls whose callback runs once per item: a list rendered inside one renders each item again. */
const ITERATORS = new Set(['map', 'flatMap']);
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export const charAt = (reader: Reader, k: number): string => {
  const token = reader.tokens[k];
  return token?.kind === 'punct' ? reader.text.charAt(token.start) : '';
};

export const wordAt = (reader: Reader, k: number): string => {
  const token = reader.tokens[k];
  return token?.kind === 'word' ? reader.text.slice(token.start, token.end) : '';
};

export const opens = (char: string): boolean => char !== '' && OPENERS.includes(char);
export const closes = (char: string): boolean => char !== '' && CLOSERS.includes(char);

/** `=>`: a `=` at `k` right against a `>`. */
export function isArrow(reader: Reader, k: number): boolean {
  const touching = reader.tokens[k]?.end === reader.tokens[k + 1]?.start;
  return charAt(reader, k) === '=' && charAt(reader, k + 1) === '>' && touching;
}

/** The index of the bracket that closes the one at `k`; `-1` when it never closes. */
export function closeOf(reader: Reader, k: number): number {
  let depth = 0;
  for (let i = k; i < reader.tokens.length; i += 1) {
    const char = charAt(reader, i);
    if (opens(char)) depth += 1;
    else if (closes(char)) {
      depth -= 1;
      if (depth === 0) return i;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

/** The index of the bracket that opens the one closing at `k`; `-1` when none does. */
export function openOf(reader: Reader, k: number): number {
  let depth = 0;
  for (let i = k; i >= 0; i -= 1) {
    const char = charAt(reader, i);
    if (closes(char)) depth += 1;
    else if (opens(char)) {
      depth -= 1;
      if (depth === 0) return i;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

/** The nearest unclosed bracket before token `k`; `-1` at the top. */
export function enclosingOf(reader: Reader, k: number): number {
  let depth = 0;
  for (let i = k - 1; i >= 0; i -= 1) {
    const char = charAt(reader, i);
    if (closes(char)) depth += 1;
    else if (opens(char)) {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

/** The span from the start of token `from` to the end of token `to`. */
export function spanOf(reader: Reader, from: number, to: number): Span {
  return { start: reader.tokens[from]?.start ?? 0, end: reader.tokens[to]?.end ?? 0 };
}

const holds = (span: Span, at: number): boolean => span.start <= at && at < span.end;

type Part = { kind: 'element' | 'expr'; span: Span };

/** What can hold JSX in the element at `at`: prop values written as `{…}` or JSX, and children. */
function partsOf(text: string, at: number): Part[] {
  const parts: Part[] = [];
  const open = text.charAt(at + 1) === '>' ? null : openAt(text, at);
  for (const attr of open?.attrs ?? []) {
    const value = attr.value;
    const opener = value === null ? '' : text.charAt(value.start);
    if (value !== null && (opener === '{' || opener === '<')) {
      parts.push({ kind: opener === '{' ? 'expr' : 'element', span: value });
    }
  }
  for (const child of childrenOf(text, at) ?? []) {
    if (child.kind !== 'text') parts.push({ kind: child.kind, span: child.span });
  }
  return parts;
}

/** From the element at `from` down to `at` through elements: `found`, or the `{…}` on the way. */
function descend(text: string, from: number, at: number): Span | 'found' | null {
  let element = from;
  for (let guard = 0; guard < 10_000; guard += 1) {
    const part = partsOf(text, element).find((candidate) => holds(candidate.span, at));
    if (part === undefined) return null;
    if (part.kind === 'expr') return part.span;
    if (part.span.start === at) return 'found';
    element = part.span.start;
  }
  return null;
}

/**
 * The JavaScript the element whose `<` is at `at` is written in: the file first, then each `{…}`
 * on the way in. The last region's root is the JSX that holds the element through elements only.
 * `[]` when `at` is no element's `<`.
 */
export function regionsTo(text: string, at: number): Region[] {
  const regions: Region[] = [];
  let tokens = jsTokens(text, 0, true);
  let span: Span = { start: 0, end: text.length };
  for (let guard = 0; guard < 1_000; guard += 1) {
    const root = tokens.findIndex((token) => token.kind === 'jsx' && holds(token, at));
    const token = tokens[root];
    if (token === undefined) return [];
    regions.push({ text, tokens, span, root });
    if (token.start === at) return regions;
    const step = descend(text, token.start, at);
    if (step === null) return [];
    if (step === 'found') return regions;
    tokens = jsTokens(text, step.start + 1, false);
    span = step;
  }
  return [];
}

/**
 * How many `.map` (or `.flatMap`) calls have `at` inside their parentheses, over all regions. A
 * list item is one copy per item only when exactly one does.
 */
export function mapsAround(regions: readonly Region[], at: number): number {
  let count = 0;
  for (const region of regions) {
    for (let k = 0; k < region.tokens.length; k += 1) {
      if (!ITERATORS.has(wordAt(region, k)) || charAt(region, k - 1) !== '.') continue;
      if (charAt(region, k + 1) !== '(') continue;
      const close = closeOf(region, k + 1);
      if (close >= 0 && holds(spanOf(region, k + 1, close), at)) count += 1;
    }
  }
  return count;
}

/** The parameters of the arrow whose `=` is at `arrow`, and the token the function starts at. */
export function arrowParams(reader: Reader, arrow: number): Made | null {
  let last = arrow - 1;
  // `(plan): Plan =>`: a simple return type stands between.
  const typed = wordAt(reader, last) !== '' && charAt(reader, last - 1) === ':';
  if (typed && charAt(reader, last - 2) === ')') last -= 2;
  if (charAt(reader, last) === ')') {
    const open = openOf(reader, last);
    return open < 0 ? null : { start: open, params: { from: open + 1, to: last } };
  }
  if (!IDENTIFIER.test(wordAt(reader, last))) return null;
  return { start: last, params: { from: last, to: last + 1 } };
}

/** How many `return` words lie between the tokens `from` and `to`. */
function returnsBetween(reader: Reader, from: number, to: number): number {
  let count = 0;
  for (let k = from + 1; k < to; k += 1) if (wordAt(reader, k) === 'return') count += 1;
  return count;
}

/** The function whose body is the block `{` at `open`: an arrow or a `function`. */
function blockFunction(reader: Reader, open: number): Made | null {
  if (charAt(reader, open - 1) === '>' && isArrow(reader, open - 2)) {
    return arrowParams(reader, open - 2);
  }
  if (charAt(reader, open - 1) !== ')') return null;
  const paren = openOf(reader, open - 1);
  if (paren < 0) return null;
  const params = { from: paren + 1, to: open - 1 };
  if (wordAt(reader, paren - 1) === 'function') return { start: paren - 1, params };
  if (wordAt(reader, paren - 2) === 'function') return { start: paren - 2, params };
  return null;
}

/**
 * The `.map` callback that returns the JSX at token `root` of the region: `(item) => <X/>`,
 * `(item) => (<X/>)`, or a block body or a `function` whose one `return` gives it. The callback
 * is the call's first argument. `null` for JSX anywhere else.
 */
export function callbackOf(reader: Reader, root: number): Callback | null {
  let k = root - 1;
  let wrapped = 0;
  while (charAt(reader, k) === '(') {
    k -= 1;
    wrapped += 1;
  }
  let made: Made | null = null;
  /** The token right after the callback: the call's `)`, or the `,` before a second argument. */
  let after = -1;
  if (charAt(reader, k) === '>' && isArrow(reader, k - 1)) {
    made = arrowParams(reader, k - 1);
    after = root + 1;
    for (let i = 0; i < wrapped; i += 1) {
      if (charAt(reader, after) !== ')') return null;
      after += 1;
    }
  } else if (wordAt(reader, k) === 'return') {
    const open = enclosingOf(reader, k);
    const close = open < 0 ? -1 : closeOf(reader, open);
    if (charAt(reader, open) !== '{' || close < 0) return null;
    // One `return` only: an early `return null` would leave some items unrendered.
    if (returnsBetween(reader, open, close) !== 1) return null;
    made = blockFunction(reader, open);
    after = close + 1;
  }
  if (made === null) return null;
  const call = made.start - 1;
  const dot = call - 2;
  if (charAt(reader, call) !== '(' || wordAt(reader, call - 1) !== 'map') return null;
  if (charAt(reader, dot) !== '.') return null;
  const end = closeOf(reader, call);
  if (end < 0 || (after !== end && charAt(reader, after) !== ',')) return null;
  return { dot, call, params: made.params };
}
