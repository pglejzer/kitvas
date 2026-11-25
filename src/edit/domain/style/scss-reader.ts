// The reader under the SCSS editor (`apply-scss.ts`): the lexical units a brace, a semicolon or a
// quote must not be read inside, the statements of a block, and the body of a rule with its own
// declarations, its context blocks (spec 4c: `@media (min-width: Npx)`, `&:hover`,
// `&:focus-visible`, `&:active`, a state inside a width) and the rules nested in it as `&__part`
// (ADR 0067). The class rules themselves are read in `scss-rules.ts`. Nothing here writes.

import {
  MAX_BREAKPOINT,
  OFF_KIT_MARKER,
  STYLE_STATES,
  type StyleContext,
  type StyleState,
} from '../ops.ts';
import type { Declaration, Span } from '../types.ts';

// ---- Reading: the lexical units a brace, a semicolon or a quote must not be read inside --------

/** Set when a string, a comment or an interpolation runs to the end of the text. */
type Flaw = { open: boolean };

export const blank = (text: string): boolean => /^[ \t]*$/.test(text);
const isSpace = (c: string | undefined): boolean =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/** The index of the line break that ends the line `at` is on, or the end of the text. */
export function endOfLine(text: string, at: number): number {
  let i = at;
  while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i += 1;
  return i;
}

export const lineStart = (text: string, at: number): number => text.lastIndexOf('\n', at - 1) + 1;

/** The indent of the line `at` starts, or none when something stands before it on that line. */
export function indentAt(text: string, at: number): string {
  const lead = text.slice(lineStart(text, at), at);
  return blank(lead) ? lead : '';
}

/** The length of the line ending that starts at `at`: 2, 1 or 0. */
export function eolAt(text: string, at: number): number {
  if (text.startsWith('\r\n', at)) return 2;
  return text[at] === '\n' ? 1 : 0;
}

/** The length of the line ending that ends right before `at`: 2, 1 or 0. */
export function eolBefore(text: string, at: number): number {
  if (at >= 2 && text[at - 2] === '\r' && text[at - 1] === '\n') return 2;
  return at >= 1 && text[at - 1] === '\n' ? 1 : 0;
}

/** A string ends at its quote. An unescaped line break leaves it open: CSS has no such string. */
function endOfString(text: string, at: number, flaw?: Flaw): number {
  const quote = text[at];
  let i = at + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === quote) return i + 1;
    if (c === '\n' || c === '\r') break;
    if (c === '\\') i += text.startsWith('\r\n', i + 1) ? 3 : 2;
    else if (c === '#' && text[i + 1] === '{') i = endOfInterpolation(text, i, flaw);
    else i += 1;
  }
  if (flaw) flaw.open = true;
  return Math.min(i, text.length);
}

/** `#{…}` from its `#` to its own `}`: braces that open no block. Strings inside may hold `}`. */
function endOfInterpolation(text: string, at: number, flaw?: Flaw): number {
  let depth = 1;
  let i = at + 2;
  while (i < text.length) {
    const c = text[i];
    if (c === '{') {
      depth += 1;
      i += 1;
    } else if (c === '}') {
      depth -= 1;
      i += 1;
      if (depth === 0) return i;
    } else {
      i = endOfAtom(text, i, flaw);
    }
  }
  if (flaw) flaw.open = true;
  return text.length;
}

/**
 * An unquoted `url(…)` is raw text up to its `)`: `url(data:image/png;base64,…)` holds a `;` and
 * `url(http://…)` a `//` that are neither a statement end nor a comment. A quoted one is left to
 * the string reader.
 */
function endOfUrl(text: string, at: number, flaw?: Flaw): number {
  let i = at + 4;
  while (isSpace(text[i])) i += 1;
  if (text[i] === '"' || text[i] === "'") return at + 4;
  while (i < text.length) {
    const c = text[i];
    if (c === ')') return i + 1;
    if (c === '\n' || c === '\r') return i;
    if (c === '\\') i += 2;
    else if (c === '#' && text[i + 1] === '{') i = endOfInterpolation(text, i, flaw);
    else i += 1;
  }
  return text.length;
}

function startsUrl(text: string, at: number): boolean {
  if (text.slice(at, at + 4).toLowerCase() !== 'url(') return false;
  return at === 0 || !/[A-Za-z0-9_-]/.test(text[at - 1] ?? '');
}

/** The index after the unit that starts at `at`: a comment, a string, `#{…}`, or one character. */
function endOfAtom(text: string, at: number, flaw?: Flaw): number {
  const c = text[at];
  const next = text[at + 1];
  if (c === '/' && next === '*') {
    const close = text.indexOf('*/', at + 2);
    if (close >= 0) return close + 2;
    if (flaw) flaw.open = true;
    return text.length;
  }
  if (c === '/' && next === '/') return endOfLine(text, at);
  if (c === '"' || c === "'") return endOfString(text, at, flaw);
  if (c === '#' && next === '{') return endOfInterpolation(text, at, flaw);
  if ((c === 'u' || c === 'U') && startsUrl(text, at)) return endOfUrl(text, at, flaw);
  return at + 1;
}

const startsComment = (text: string, at: number): boolean =>
  text[at] === '/' && (text[at + 1] === '*' || text[at + 1] === '/');

/** Past whitespace and comments, never past `to`. */
function skipTrivia(text: string, from: number, to: number): number {
  let i = from;
  while (i < to) {
    if (isSpace(text[i])) i += 1;
    else if (startsComment(text, i)) i = endOfAtom(text, i);
    else break;
  }
  return Math.min(i, to);
}

/**
 * The start of the first line after `from` that begins outside a comment, never past `to`; -1
 * when no line starts between them. A new line of text may go there.
 */
export function lineAfter(text: string, from: number, to: number): number {
  let i = from;
  while (i < to) {
    if (startsComment(text, i)) i = endOfAtom(text, i);
    else if (text[i] === '\n') return i + 1;
    else i += 1;
  }
  return -1;
}

/** The index of the `}` that closes the `{` at `open`, or -1. */
function matchBrace(text: string, open: number): number {
  let depth = 1;
  let i = open + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '{') {
      depth += 1;
      i += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
      i += 1;
    } else {
      i = endOfAtom(text, i);
    }
  }
  return -1;
}

/**
 * Braces balance outside strings and comments, and no string, comment or interpolation is left
 * open: the check a new SCSS text passes before it is written (spec decision 10).
 */
export function scssBalanced(text: string): boolean {
  const flaw: Flaw = { open: false };
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '{') {
      depth += 1;
      i += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth < 0) return false;
      i += 1;
    } else {
      i = endOfAtom(text, i, flaw);
      if (flaw.open) return false;
    }
  }
  return depth === 0;
}

// ---- Reading: statements, declarations and rules ------------------------------------------------

/** One statement of a block: `a: b;`, `@include x;`, or a prelude with its own `{…}`. */
export type Statement = {
  /** The first character after whitespace and comments. */
  start: number;
  /** The index of its `{` or `;`, or where it stops without one (the parent's `}`). */
  stop: number;
  /** After its `;` or its closing `}`. */
  end: number;
  /** The inside of its braces: after `{`, and the index of the closing `}`. */
  block: Block | null;
  /** Ended by `;` or by a closing `}`. */
  terminated: boolean;
};

/** The statements between `from` and `to` (the index of the enclosing `}`, or the text's end). */
export function statements(text: string, from: number, to: number): Statement[] {
  const list: Statement[] = [];
  let i = skipTrivia(text, from, to);
  while (i < to) {
    if (text[i] === ';' || text[i] === '}') {
      i = skipTrivia(text, i + 1, to);
      continue;
    }
    const start = i;
    let made: Statement | null = null;
    let j = i;
    while (j < to && made === null) {
      const c = text[j];
      if (c === '{') {
        const close = matchBrace(text, j);
        const closed = close >= 0 && close < to;
        const inner = closed ? close : to;
        made = {
          start,
          stop: j,
          end: closed ? close + 1 : to,
          block: { open: j + 1, close: inner },
          terminated: closed,
        };
      } else if (c === ';') {
        made = { start, stop: j, end: j + 1, block: null, terminated: true };
      } else if (c === '}') {
        made = { start, stop: j, end: j, block: null, terminated: false };
      } else {
        j = endOfAtom(text, j);
      }
    }
    made ??= { start, stop: to, end: to, block: null, terminated: false };
    list.push(made);
    i = skipTrivia(text, made.end, to);
  }
  return list;
}

/** A declaration of a rule's own body, with the places a rewrite keeps as they are. */
export type Own = {
  view: Declaration;
  /** The trimmed value. */
  value: Span;
  /** After the `;`; the value's end when the declaration has none (the last one of a body). */
  semiEnd: number;
};

const PROPERTY = /^[-A-Za-z_][A-Za-z0-9_-]*/;

function readDeclaration(text: string, statement: Statement): Own | null {
  if (statement.block !== null) return null;
  const name = PROPERTY.exec(text.slice(statement.start, statement.stop))?.[0];
  if (name === undefined) return null;
  const colon = skipTrivia(text, statement.start + name.length, statement.stop);
  if (colon >= statement.stop || text[colon] !== ':') return null;

  const raw = text.slice(colon + 1, statement.stop);
  let written = raw.trimEnd();
  let offKit = false;
  let semiEnd: number;
  let end: number;
  if (statement.terminated) {
    semiEnd = statement.stop + 1;
    end = semiEnd;
    let mark = semiEnd;
    while (text[mark] === ' ' || text[mark] === '\t') mark += 1;
    if (text.startsWith(OFF_KIT_MARKER, mark)) {
      offKit = true;
      end = mark + OFF_KIT_MARKER.length;
    }
  } else {
    // No `;` before the closing brace: the marker, if any, follows the value itself.
    end = colon + 1 + written.length;
    if (written.endsWith(OFF_KIT_MARKER)) {
      offKit = true;
      written = written.slice(0, -OFF_KIT_MARKER.length).trimEnd();
    }
    semiEnd = colon + 1 + written.length;
  }
  const value = written.trimStart();
  const valueStart = colon + 1 + (written.length - value.length);
  return {
    view: { property: name, value, offKit, span: { start: statement.start, end } },
    value: { start: valueStart, end: valueStart + value.length },
    semiEnd,
  };
}

export type Block = { open: number; close: number };

function nestedProperties(text: string, block: Block, into: string[]): void {
  for (const statement of statements(text, block.open, block.close)) {
    if (statement.block !== null) {
      nestedProperties(text, statement.block, into);
      continue;
    }
    const property = readDeclaration(text, statement)?.view.property;
    if (property !== undefined && !into.includes(property)) into.push(property);
  }
}

/** The inside of a rule or of one of its context blocks, with what the writer needs. */
export type Body = {
  /** After the `{`. */
  open: number;
  /** The index of the closing `}`. */
  close: number;
  /** False when the file ends inside it. */
  closed: boolean;
  own: Own[];
  /** Every statement of the body, in order: for the indent and for the place of a new one. */
  parts: Span[];
  /** The body's last statement has no `;`: nothing can be appended after it. */
  dangling: boolean;
  /** The context blocks right inside this body, in file order. */
  blocks: Nest[];
  /** Properties set only inside its other nested blocks: never written. */
  nested: string[];
  /** The rules right inside a rule's body that join a class name to `&`, in file order. */
  joins: Join[];
};

/** A context block: a width, a state, or a state inside a width's block. */
export type Nest = Body & {
  context: StyleContext;
  /** From the prelude to the end of the closing `}`. */
  span: Span;
};

/**
 * A nested rule whose prelude is `&` and characters of a class name (`&__switch`, `&--featured`,
 * `&-2`): it styles the class `<the class around it><suffix>`, never the element around it.
 */
export type Join = { suffix: string; span: Span; block: Block; closed: boolean };

const JOIN = /^&([A-Za-z0-9_-]+)$/;
const MEDIA = /^@media\s*\(\s*min-width\s*:\s*([1-9]\d{0,4})px\s*\)$/i;
const STATE = /^&:([a-z-]+)$/;

/**
 * The context a nested block's prelude names, inside a body of `width` (`null`: the rule itself).
 * A width's block is read only in the rule, never inside another one.
 */
function contextOf(prelude: string, width: number | null): StyleContext | null {
  const word = STATE.exec(prelude)?.[1];
  const state: StyleState | undefined = STYLE_STATES.find((name) => name === word);
  if (state !== undefined) return { width, state };
  const size = width === null ? Number(MEDIA.exec(prelude)?.[1] ?? Number.NaN) : Number.NaN;
  return Number.isInteger(size) && size <= MAX_BREAKPOINT ? { width: size, state: null } : null;
}

/** The prelude without its comments, so `/* a *\/ .card /* b *\/` reads as `.card`. */
export function withoutComments(text: string, from: number, to: number): string {
  let out = '';
  let i = from;
  while (i < to) {
    const end = Math.min(endOfAtom(text, i), to);
    if (!startsComment(text, i)) out += text.slice(i, end);
    i = end;
  }
  return out;
}

/**
 * A body with its declarations, context blocks and joined rules. `width`: the width of the block
 * it is in (`null` in the rule). `leaf`: a state's block, where no context block is read any more.
 */
export function readBody(
  text: string,
  block: Block,
  closed: boolean,
  width: number | null,
  leaf: boolean,
): Body {
  const body = statements(text, block.open, block.close);
  const own: Own[] = [];
  const blocks: Nest[] = [];
  const joins: Join[] = [];
  const inNested: string[] = [];
  for (const inner of body) {
    if (inner.block !== null) {
      const prelude = withoutComments(text, inner.start, inner.stop).trim();
      // A join inside a width's or a state's block is not a rule kitvas reads: it stays nested.
      const suffix = width === null && !leaf ? JOIN.exec(prelude)?.[1] : undefined;
      if (suffix !== undefined) {
        // `&__title { … }` is the rule of another class: read as that class's, never this one's.
        const span = { start: inner.start, end: inner.end };
        joins.push({ suffix, span, block: inner.block, closed: inner.terminated });
        continue;
      }
      const context = leaf ? null : contextOf(prelude, width);
      if (context !== null) {
        blocks.push({
          ...readBody(text, inner.block, inner.terminated, context.width, context.state !== null),
          context,
          span: { start: inner.start, end: inner.end },
        });
      } else if (prelude.startsWith('&') || prelude.startsWith('@')) {
        // `&.is-open` and other `@` rules style this element; `.title { … }` is another one.
        nestedProperties(text, inner.block, inNested);
      }
      continue;
    }
    const declaration = readDeclaration(text, inner);
    if (declaration !== null) own.push(declaration);
  }
  const last = body.at(-1);
  return {
    open: block.open,
    close: block.close,
    closed,
    own,
    parts: body.map((inner) => ({ start: inner.start, end: inner.end })),
    dangling: last !== undefined && last.block === null && !last.terminated,
    blocks,
    nested: inNested.filter((name) => !own.some((d) => d.view.property === name)),
    joins,
  };
}
