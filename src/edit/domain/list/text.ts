// The text of a data list item (spec 4c, goal 9; plan 16, task D): an element whose only child is
// `{item.field}` (or `{item}`, or a field a `({ title }) =>` pattern binds) shows a string of the
// array's item. When that string is a literal, the editor reads it and writes it back in the same
// quotes. Pure: it reads the tokens `list-find.ts` found and decodes nothing it does not know.

import { childrenOf } from '../structure/subtree.ts';
import type { Span } from '../types.ts';
import type { ArrayView, ItemView, Param } from './find.ts';
import { charAt, closeOf, closes, opens, type Reader, wordAt } from './path.ts';

/** Which part of an item the element's text shows: the item itself (`null`) or one field. */
export type TextField = { field: string | null };

const QUOTES = new Set(["'", '"', '`']);
const READ = /^([A-Za-z_$][\w$]*)(?:\??\.([A-Za-z_$][\w$]*))?$/;
const SIMPLE_ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
};
/** The line and paragraph separators: a string may hold them, but they read as line ends. */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/** The `\u` escape whose `u` is at `i` of `body`: its character, and its length past `i`. */
function unicodeAt(body: string, i: number): { char: string; length: number } | null {
  const braced = /^\{([0-9a-fA-F]{1,6})\}/.exec(body.slice(i + 1));
  const hex = braced === null ? body.slice(i + 1, i + 5) : braced[1];
  if (hex === undefined || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (braced === null && hex.length !== 4) return null;
  const code = Number.parseInt(hex, 16);
  if (code > 0x10ffff) return null;
  return { char: String.fromCodePoint(code), length: braced === null ? 4 : hex.length + 2 };
}

/** The value of a JavaScript string literal as written (quotes included); `null` when unsure. */
export function decodeString(raw: string): string | null {
  const quote = raw.charAt(0);
  if (!QUOTES.has(quote) || raw.length < 2 || raw.charAt(raw.length - 1) !== quote) return null;
  const body = raw.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const char = body.charAt(i);
    if (quote === '`' && char === '$' && body.charAt(i + 1) === '{') return null;
    if (char === '\r' || char === '\n') {
      // Only a template may break a line; it reads CRLF as LF.
      if (quote !== '`') return null;
      if (char === '\r' && body.charAt(i + 1) === '\n') i += 1;
      out += '\n';
      continue;
    }
    if (char !== '\\') {
      out += char;
      continue;
    }
    i += 1;
    const next = body.charAt(i);
    const simple = SIMPLE_ESCAPES[next];
    if (simple !== undefined) {
      out += simple;
    } else if (next === 'x') {
      const hex = body.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null;
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 2;
    } else if (next === 'u') {
      const unicode = unicodeAt(body, i);
      if (unicode === null) return null;
      out += unicode.char;
      i += unicode.length;
    } else if (next === '0' && !/[0-9]/.test(body.charAt(i + 1))) {
      out += '\0';
    } else if (/[0-9]/.test(next) || next === '') {
      // Octal escapes, and a backslash at the very end: not read.
      return null;
    } else if (
      next === '\r' ||
      next === '\n' ||
      next === LINE_SEPARATOR ||
      next === PARAGRAPH_SEPARATOR
    ) {
      // A line continuation adds nothing.
      if (next === '\r' && body.charAt(i + 1) === '\n') i += 1;
    } else {
      out += next;
    }
  }
  return out;
}

/** `value` as a string literal in `quote`, escaping only what the quote and the line need. */
export function encodeString(value: string, quote: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value.charAt(i);
    if (char === '\\' || char === quote) out += `\\${char}`;
    else if (char === '\n') out += '\\n';
    else if (char === '\r') out += '\\r';
    else if (char === LINE_SEPARATOR) out += '\\u2028';
    else if (char === PARAGRAPH_SEPARATOR) out += '\\u2029';
    else if (quote === '`' && char === '$' && value.charAt(i + 1) === '{') out += '\\$';
    else out += char;
  }
  return `${quote}${out}${quote}`;
}

/** Token `k` is a whole string literal: quoted, or a template without `${…}`. */
function isString(reader: Reader, k: number): boolean {
  const token = reader.tokens[k];
  if (token?.kind !== 'literal') return false;
  return decodeString(reader.text.slice(token.start, token.end)) !== null;
}

/** The name a property key at token `k` writes: `title`, `'title'` or `"title"`. */
function keyAt(reader: Reader, k: number): string | null {
  const word = wordAt(reader, k);
  if (word !== '') return word;
  const token = reader.tokens[k];
  if (token?.kind !== 'literal') return null;
  const raw = reader.text.slice(token.start, token.end);
  return raw.charAt(0) === '`' ? null : decodeString(raw);
}

/**
 * The token of the string the element's text shows in `item`: the item itself, or the value of
 * its property `field` when the item is an object literal. `null` when it is anything else.
 */
export function valueToken(array: ArrayView, item: ItemView, field: string | null): number | null {
  const { reader } = array;
  if (field === null) {
    return item.first === item.last && isString(reader, item.first) ? item.first : null;
  }
  if (charAt(reader, item.first) !== '{' || closeOf(reader, item.first) !== item.last) return null;
  let found: number | null = null;
  let depth = 0;
  for (let k = item.first + 1; k < item.last; k += 1) {
    const char = charAt(reader, k);
    const starts = k === item.first + 1 || charAt(reader, k - 1) === ',';
    if (depth === 0 && starts && charAt(reader, k + 1) === ':' && keyAt(reader, k) === field) {
      // The last one wins, as in JavaScript.
      const value = k + 2;
      const ends = charAt(reader, value + 1) === ',' || value + 1 === item.last;
      found = ends && isString(reader, value) ? value : null;
    }
    if (opens(char)) depth += 1;
    else if (closes(char)) depth -= 1;
  }
  return found;
}

/**
 * Which part of the item the element at `at` shows as its text, through the callback's first
 * parameter; `null` when its children are anything but one `{…}` reading it.
 */
export function textField(text: string, at: number, param: Param): TextField | null {
  const children = childrenOf(text, at);
  const only = children?.length === 1 ? children[0] : undefined;
  if (only === undefined || only.kind !== 'expr') return null;
  const read = READ.exec(text.slice(only.span.start + 1, only.span.end - 1).trim());
  if (read === null) return null;
  const name = read[1] ?? '';
  const field = read[2];
  if (param.kind === 'name' && param.name === name) return { field: field ?? null };
  if (param.kind !== 'fields' || field !== undefined) return null;
  const key = param.fields.get(name);
  return key === undefined ? null : { field: key };
}

/** The span of the string literal at token `k`. */
export function tokenSpan(reader: Reader, k: number): Span {
  const token = reader.tokens[k];
  return { start: token?.start ?? 0, end: token?.end ?? 0 };
}

/** The value of the string literal at token `k`; `null` when it is none. */
export function stringAt(reader: Reader, k: number): string | null {
  const span = tokenSpan(reader, k);
  return decodeString(reader.text.slice(span.start, span.end));
}
