// The reader of the editor's TSX side: where a line and column are in the text, and what one
// JSX opening tag writes (spec 4a, decisions 4 and 6; spike 1). `apply-tsx.ts` edits what this
// file reads, and hands its public functions on.
//
// There is no parser here. A scanner walks the text and knows only what it must skip: strings,
// template literals, comments, regular expressions and whole JSX elements inside `{…}`. JSX text
// is not code, so an apostrophe in it never opens a string.

import type { PropValue } from './ops.ts';
import type { PropView, Refusal, Span, TagView } from './types.ts';

/** One scan of a text: the opening tags met so far, and the `<` that turned out not to be JSX. */
type Scan = { text: string; tags: number[]; failed: Set<number> };
/** A named attribute as written; `value` is its span with the quotes or braces, if it has one. */
export type Attr = { name: string; span: Span; value: Span | null };
export type Open = {
  name: string;
  nameEnd: number;
  attrs: Attr[];
  spread: boolean;
  /** Where the first attribute or spread starts. */
  first: number | null;
  end: number;
  selfClosing: boolean;
};
export type Written =
  | { kind: 'string'; value: string; inner: Span; quote: string }
  | { kind: 'number'; value: number; inner: Span }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'expr'; source: string };

const TAG_NAME = /[A-Za-z_$][\w$]*(?:[.:-][\w$]+)*/y;
const ATTR_NAME = /[A-Za-z_$][\w$]*(?:[:-][\w$]+)*/y;
const WORD = /[\w$\u0080-￿]+/y;
const JSX_START = /[A-Za-z_$>]/;
const NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
/** Words after which a value starts, so a `<` there opens JSX and a `/` a regular expression. */
const BEFORE_VALUE = new Set(
  'return yield await case default typeof void delete throw new in of do else instanceof'.split(
    ' ',
  ),
);

const newScan = (text: string): Scan => ({ text, tags: [], failed: new Set() });
export const isSpace = (char: string): boolean =>
  char === ' ' || char === '\t' || char === '\n' || char === '\r';

function matchAt(pattern: RegExp, text: string, at: number): string | null {
  pattern.lastIndex = at;
  return pattern.exec(text)?.[0] ?? null;
}

/**
 * The offset of a 1-based line and column, as esbuild's `jsxDev` gives them: lines end at `\n`
 * (so the `\r` of a CRLF file is the last column of its line) and columns count UTF-16 units.
 * `-1` when the file has no such line.
 */
export function offsetOf(text: string, line: number, column: number): number {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) return -1;
  let start = 0;
  for (let current = 1; current < line; current += 1) {
    const breakAt = text.indexOf('\n', start);
    if (breakAt < 0) return -1;
    start = breakAt + 1;
  }
  return start + column - 1;
}

/** A quoted JavaScript string. An unclosed one ends at its line, so a misread cannot run on. */
function skipString(text: string, at: number): number {
  const quote = text.charAt(at);
  let i = at + 1;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '\\') {
      i += text.startsWith('\r\n', i + 1) ? 3 : 2;
      continue;
    }
    if (char === quote) return i + 1;
    if (char === '\n') return i;
    i += 1;
  }
  return text.length;
}

/** A template literal with its `${…}` parts; `-1` when it never closes. */
function skipTemplate(scan: Scan, at: number): number {
  const { text } = scan;
  let i = at + 1;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '\\') i += 2;
    else if (char === '`') return i + 1;
    else if (char === '$' && text.charAt(i + 1) === '{') {
      i = skipJs(scan, i + 2, false);
      if (i < 0) return -1;
    } else i += 1;
  }
  return -1;
}

/** A regular expression literal on one line; `-1` when the `/` is a division after all. */
function skipRegex(text: string, at: number): number {
  let inClass = false;
  for (let i = at + 1; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (char === '\n') return -1;
    if (char === '\\') i += 1;
    else if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return i + 1;
  }
  return -1;
}

/**
 * Walks JavaScript from `from` to the `}` that closes it, or to the end of the text with
 * `toEnd`. `-1` when it never closes. `value` says whether the last token ended a value: only
 * where it did not can a `<` open JSX (elsewhere it compares, or opens type arguments).
 */
function skipJs(scan: Scan, from: number, toEnd: boolean): number {
  const { text } = scan;
  const unclosed = toEnd ? text.length : -1;
  let depth = 0;
  let value = false;
  let i = from;
  while (i < text.length) {
    const char = text.charAt(i);
    if (isSpace(char)) {
      i += 1;
    } else if (char === '"' || char === "'") {
      i = skipString(text, i);
      value = true;
    } else if (char === '`') {
      i = skipTemplate(scan, i);
      if (i < 0) return unclosed;
      value = true;
    } else if (char === '/' && text.charAt(i + 1) === '/') {
      const lineEnd = text.indexOf('\n', i);
      i = lineEnd < 0 ? text.length : lineEnd;
    } else if (char === '/' && text.charAt(i + 1) === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) return unclosed;
      i = end + 2;
    } else if (char === '/') {
      const end: number = value ? -1 : skipRegex(text, i);
      value = end >= 0;
      i = end >= 0 ? end : i + 1;
    } else if (char === '{') {
      depth += 1;
      value = false;
      i += 1;
    } else if (char === '}') {
      if (depth === 0 && !toEnd) return i + 1;
      depth = Math.max(0, depth - 1);
      value = false;
      i += 1;
    } else if (char === '<' && !value && JSX_START.test(text.charAt(i + 1))) {
      const end = tryElement(scan, i);
      value = end >= 0;
      i = end >= 0 ? end : i + 1;
    } else {
      const word = matchAt(WORD, text, i);
      if (word === null) {
        value = char === ')' || char === ']';
        i += 1;
      } else {
        value = !BEFORE_VALUE.has(word);
        i += word.length;
      }
    }
  }
  return unclosed;
}

/** An element where JSX may start. A `<` that does not read as one is an operator: `-1`. */
function tryElement(scan: Scan, at: number): number {
  if (scan.failed.has(at)) return -1;
  const mark = scan.tags.length;
  const end = skipElement(scan, at);
  if (end < 0) {
    scan.tags.length = mark;
    scan.failed.add(at);
  }
  return end;
}

/** An element or fragment from its `<` to the end of its closing tag; `-1` when it is not one. */
function skipElement(scan: Scan, at: number): number {
  if (scan.text.charAt(at + 1) === '>') return skipChildren(scan, at + 2, '');
  // Noted before its props are read, so the tags stay in source order.
  scan.tags.push(at);
  const open = readOpen(scan, at);
  if (open === null) return -1;
  return open.selfClosing ? open.end : skipChildren(scan, open.end, open.name);
}

/** JSX children up to the closing tag of `name`. Text is passed over, never read as code. */
function skipChildren(scan: Scan, from: number, name: string): number {
  const { text } = scan;
  let i = from;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '{') {
      i = skipJs(scan, i + 1, false);
    } else if (char !== '<') {
      i += 1;
    } else if (text.charAt(i + 1) === '/') {
      return closingEnd(text, i, name);
    } else {
      i = JSX_START.test(text.charAt(i + 1)) ? skipElement(scan, i) : -1;
    }
    if (i < 0) return -1;
  }
  return -1;
}

/** The end of `</name>` at `at`; `-1` when another tag, or no tag, closes there. */
function closingEnd(text: string, at: number, name: string): number {
  if (!text.startsWith('</', at)) return -1;
  const start = skipTagSpace(text, at + 2);
  const found = matchAt(TAG_NAME, text, start) ?? '';
  if (found !== name) return -1;
  const end = skipTagSpace(text, start + found.length);
  return text.charAt(end) === '>' ? end + 1 : -1;
}

/** Whitespace and comments between the parts of a tag. */
function skipTagSpace(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (isSpace(text.charAt(i))) {
      i += 1;
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    } else break;
  }
  return i;
}

/** The opening tag at `at`, with every attribute's span; `null` when no tag reads there. */
function readOpen(scan: Scan, at: number): Open | null {
  const { text } = scan;
  const name = matchAt(TAG_NAME, text, at + 1);
  if (name === null) return null;
  const nameEnd = at + 1 + name.length;
  const attrs: Attr[] = [];
  let spread = false;
  let first: number | null = null;
  let i = nameEnd;
  for (;;) {
    i = skipTagSpace(text, i);
    const char = text.charAt(i);
    if (char === '>') {
      return { name, nameEnd, attrs, spread, first, end: i + 1, selfClosing: false };
    }
    if (char === '/' && text.charAt(i + 1) === '>') {
      return { name, nameEnd, attrs, spread, first, end: i + 2, selfClosing: true };
    }
    first ??= i;
    if (char === '{') {
      const end = skipJs(scan, i + 1, false);
      if (end < 0 || !text.startsWith('...', skipTagSpace(text, i + 1))) return null;
      spread = true;
      i = end;
      continue;
    }
    const attr = matchAt(ATTR_NAME, text, i);
    if (attr === null) return null;
    const attrEnd = i + attr.length;
    const equals = skipTagSpace(text, attrEnd);
    if (text.charAt(equals) !== '=') {
      attrs.push({ name: attr, span: { start: i, end: attrEnd }, value: null });
      i = attrEnd;
      continue;
    }
    const valueStart = skipTagSpace(text, equals + 1);
    const valueEnd = valueEndAt(scan, valueStart);
    if (valueEnd < 0) return null;
    attrs.push({
      name: attr,
      span: { start: i, end: valueEnd },
      value: { start: valueStart, end: valueEnd },
    });
    i = valueEnd;
  }
}

/** An attribute value: a JSX string (no escapes: it ends at its quote), `{…}` or an element. */
function valueEndAt(scan: Scan, at: number): number {
  const { text } = scan;
  const char = text.charAt(at);
  if (char === '"' || char === "'") {
    const close = text.indexOf(char, at + 1);
    return close < 0 ? -1 : close + 1;
  }
  if (char === '{') return skipJs(scan, at + 1, false);
  return char === '<' ? skipElement(scan, at) : -1;
}

/** The opening tag whose `<` is at `at`, for an edit; `null` when there is none. */
export function openAt(text: string, at: number): Open | null {
  return text.charAt(at) === '<' ? readOpen(newScan(text), at) : null;
}

export function trimSpan(text: string, span: Span): Span {
  let { start, end } = span;
  while (start < end && isSpace(text.charAt(start))) start += 1;
  while (end > start && isSpace(text.charAt(end - 1))) end -= 1;
  return { start, end };
}

/** How an attribute's value is written: a literal the editor can write, or an expression. */
export function written(text: string, attr: Attr): Written {
  if (attr.value === null) return { kind: 'boolean', value: true };
  const { start, end } = attr.value;
  const opener = text.charAt(start);
  if (opener === '"' || opener === "'") {
    const inner = { start: start + 1, end: end - 1 };
    return { kind: 'string', value: text.slice(inner.start, inner.end), inner, quote: opener };
  }
  if (opener !== '{') return { kind: 'expr', source: text.slice(start, end) };
  const inner = trimSpan(text, { start: start + 1, end: end - 1 });
  const source = text.slice(inner.start, inner.end);
  if (source === 'true' || source === 'false') {
    return { kind: 'boolean', value: source === 'true' };
  }
  if (NUMBER.test(source)) return { kind: 'number', value: Number(source), inner };
  return { kind: 'expr', source };
}

function propView(text: string, attr: Attr): PropView {
  const value = written(text, attr);
  if (value.kind === 'expr') {
    return { name: attr.name, kind: 'expr', source: value.source, span: attr.span };
  }
  const literal: PropValue =
    value.kind === 'string'
      ? { kind: 'string', value: value.value }
      : value.kind === 'number'
        ? { kind: 'number', value: value.value }
        : { kind: 'boolean', value: value.value };
  return { name: attr.name, kind: 'literal', value: literal, span: attr.span };
}

/**
 * The one plain text child. Text over several lines is left out: `setText` takes no line break,
 * so its inverse could not put such a text back.
 */
export function plainText(text: string, open: Open): { value: string; span: Span } | null {
  if (open.selfClosing) return null;
  let i = open.end;
  while (i < text.length && text.charAt(i) !== '<' && text.charAt(i) !== '{') i += 1;
  if (closingEnd(text, i, open.name) < 0) return null;
  const span = trimSpan(text, { start: open.end, end: i });
  const value = text.slice(span.start, span.end);
  return value === '' || /[\r\n]/.test(value) ? null : { value, span };
}

function classView(text: string, attr: Attr | undefined): TagView['className'] {
  if (attr === undefined) return null;
  const value = written(text, attr);
  if (value.kind === 'string') return { kind: 'string', value: value.value, span: attr.span };
  const source = value.kind === 'expr' ? value.source : String(value.value);
  return { kind: 'expr', source, span: attr.span };
}

/**
 * The opening tag at `at` as the panel shows it. `props` has every named attribute but
 * `className`, which has its own field.
 */
export function readTag(text: string, at: number): TagView | Refusal {
  const open = openAt(text, at);
  if (open === null) return 'not-found';
  const named = open.attrs.filter((attr) => attr.name !== 'className');
  const className = open.attrs.find((attr) => attr.name === 'className');
  return {
    name: open.name,
    span: { start: at, end: open.end },
    selfClosing: open.selfClosing,
    props: named.map((attr) => propView(text, attr)),
    spread: open.spread,
    className: classView(text, className),
    text: plainText(text, open),
  };
}

/** The offset of every opening tag in the text, in source order (fragments have none). */
export function openingTags(text: string): number[] {
  const scan = newScan(text);
  skipJs(scan, 0, true);
  return scan.tags;
}
