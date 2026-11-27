// The whole extent of a JSX element and what it holds, for the structural ops (spec 4b, decision 1;
// plan 14, task A1). Pure and parser-free: it walks the text with the 4a reader's scanner
// (`tsx-reader.ts`), which already skips strings, templates, comments, regular expressions and
// JSX inside `{…}`.

import {
  elementEnd,
  expressionEnd,
  type JsToken,
  jsTokens,
  type Open,
  openAt,
  skipTagSpace,
} from '../tsx/tsx-reader.ts';
import type { Span } from '../types.ts';

export type ChildKind = 'element' | 'expr' | 'text';
/** One direct child between an element's tags, in source order; `text` is a non-blank run. */
export type Child = { kind: ChildKind; span: Span };
/**
 * Where an element is written: among its parent's children (`plain`), inside a `{…}` child such
 * as a `.map` or a condition (`expression`), or as a prop's value (`slot`, `title={<Heading />}`).
 * The root a function returns is `plain`.
 */
export type ElementContext = 'plain' | 'expression' | 'slot';

/** A part of an element that can hold another: `prop` for a prop's value or a spread. */
type Part = Child & { prop: boolean };
/** One step from an element down to `at`: the element there (`expr: null`) or a `{…}` around it. */
type Step = { parent: number; slot: boolean; expr: Part | null };
type Names = { read: Set<string>; bound: Set<string> };

const BLANK = /^[ \t\r\n]*$/;
/** Words that name no variable. `as` and `satisfies` are here too: a type follows them. */
const KEYWORDS = new Set([
  ...'as async await break case catch class const continue debugger default delete do'.split(' '),
  ...'else export extends false finally for function if import in instanceof let new'.split(' '),
  ...'null of return satisfies super switch this throw true try typeof undefined var'.split(' '),
  ...'void while with yield'.split(' '),
]);
/** Words before a `(…) {` that is a block, not the body of a method. */
const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);

const holds = (span: Span, at: number): boolean => span.start <= at && at < span.end;
const isFragment = (text: string, at: number): boolean => text.charAt(at + 1) === '>';

/** The one element or fragment `source` is, from its `<`; `null` for anything else. */
export function wholeElement(source: string): Span | null {
  const start = source.length - source.trimStart().length;
  if (source.charAt(start) !== '<') return null;
  const span = elementSpan(source, start);
  return span !== null && source.slice(span.end).trim() === '' ? span : null;
}

/** The element whose `<` is at `at`, through the end of its closing tag; `null` when it is none. */
export function elementSpan(text: string, at: number): Span | null {
  const end = elementEnd(text, at);
  return end < 0 ? null : { start: at, end };
}

/**
 * JSX children from `from` up to a closing tag or `limit`. Text is one raw run between two other
 * children, kept only when it is more than whitespace.
 */
function readChildren(text: string, from: number, limit: number): Child[] {
  const children: Child[] = [];
  let run = from;
  let i = from;
  const flush = (to: number): void => {
    if (!BLANK.test(text.slice(run, to))) {
      children.push({ kind: 'text', span: { start: run, end: to } });
    }
  };
  while (i < limit) {
    const char = text.charAt(i);
    if (char !== '{' && char !== '<') {
      i += 1;
      continue;
    }
    const end = char === '{' ? expressionEnd(text, i) : elementEnd(text, i);
    // The closing tag of the parent (or text that no longer reads as JSX) ends the children.
    if (end < 0) break;
    flush(i);
    children.push({ kind: char === '{' ? 'expr' : 'element', span: { start: i, end } });
    i = end;
    run = end;
  }
  flush(Math.max(run, Math.min(i, limit)));
  return children;
}

/** Where the children of the element at `at` start; `null` when it closes itself. */
function childrenStart(text: string, at: number): number | null {
  if (isFragment(text, at)) return at + 2;
  const open = openAt(text, at);
  return open === null || open.selfClosing ? null : open.end;
}

/** The direct children of the element at `at`; `[]` when it closes itself, `null` when none. */
export function childrenOf(text: string, at: number): Child[] | null {
  if (elementEnd(text, at) < 0) return null;
  const from = childrenStart(text, at);
  return from === null ? [] : readChildren(text, from, text.length);
}

/** The `{…}` and elements an opening tag writes as prop values, and its spreads. */
function propParts(text: string, open: Open): Part[] {
  const parts: Part[] = [];
  let i = open.nameEnd;
  for (const attr of [...open.attrs, null]) {
    // Spreads are not among `attrs`: they stand before an attribute or before the tag's end.
    for (;;) {
      i = skipTagSpace(text, i);
      const end = expressionEnd(text, i);
      if (end < 0) break;
      parts.push({ kind: 'expr', span: { start: i, end }, prop: true });
      i = end;
    }
    if (attr === null) break;
    const opener = attr.value === null ? '' : text.charAt(attr.value.start);
    if (attr.value !== null && (opener === '{' || opener === '<')) {
      parts.push({ kind: opener === '{' ? 'expr' : 'element', span: attr.value, prop: true });
    }
    i = attr.span.end;
  }
  return parts;
}

/** Everything in the element at `at` that can hold JSX: prop values, spreads, children. */
function partsOf(text: string, at: number): Part[] {
  const open = isFragment(text, at) ? null : openAt(text, at);
  const props = open === null ? [] : propParts(text, open);
  const from = childrenStart(text, at);
  const children = from === null ? [] : readChildren(text, from, text.length);
  const held = children.filter((child) => child.kind !== 'text');
  return [...props, ...held.map((child) => ({ ...child, prop: false }))];
}

/** From the element at `from` down to `at`, through elements only, to the first `{…}` or `at`. */
function descend(text: string, from: number, at: number): Step | null {
  let parent = from;
  let slot = false;
  for (;;) {
    const part = partsOf(text, parent).find((candidate) => holds(candidate.span, at));
    if (part === undefined) return null;
    slot ||= part.prop;
    if (part.kind === 'expr') return { parent, slot, expr: part };
    if (part.span.start === at) return { parent, slot, expr: null };
    parent = part.span.start;
  }
}

/**
 * The way from the file to `at`: the JavaScript it passes through (the file, then every `{…}`
 * on the way in) and the steps between them. `found`: `at` is an element's `<`.
 */
function walkTo(text: string, at: number): { regions: JsToken[][]; steps: Step[]; found: boolean } {
  const regions: JsToken[][] = [];
  const steps: Step[] = [];
  let tokens = jsTokens(text, 0, true);
  for (;;) {
    regions.push(tokens);
    const root = tokens.find((token) => token.kind === 'jsx' && holds(token, at));
    if (root === undefined) return { regions, steps, found: false };
    if (root.start === at) return { regions, steps, found: true };
    const step = descend(text, root.start, at);
    if (step === null) return { regions, steps, found: false };
    steps.push(step);
    if (step.expr === null) return { regions, steps, found: true };
    tokens = jsTokens(text, step.expr.span.start + 1, false);
  }
}

function placeOf(text: string, at: number): { parent: number | null; context: ElementContext } {
  const { steps, found } = walkTo(text, at);
  const last = steps[steps.length - 1];
  if (!found || last === undefined) return { parent: null, context: 'plain' };
  // The nearest link decides: a `{…}` child is an expression even inside a slot. Otherwise a
  // prop's value anywhere on the way up makes it a part of that slot.
  if (last.expr !== null && !last.expr.prop) return { parent: last.parent, context: 'expression' };
  const slot = steps.some((step) => step.slot);
  return { parent: last.parent, context: slot ? 'slot' : 'plain' };
}

/**
 * The `<` of the element that holds the one at `at` as a child; `null` for a root. A fragment
 * counts as a parent; for JSX in a prop it is the element that writes the prop.
 */
export function parentOf(text: string, at: number): number | null {
  return placeOf(text, at).parent;
}

export function contextOf(text: string, at: number): ElementContext {
  return placeOf(text, at).context;
}

/** The element at `at` has both non-blank text and elements among its direct children. */
export function isMixed(text: string, at: number): boolean {
  const kinds = new Set((childrenOf(text, at) ?? []).map((child) => child.kind));
  return kinds.has('text') && kinds.has('element');
}

type Frame = {
  start: number;
  /** Its `{` opens a function's body. */
  body: boolean;
  /** The word before its `(`. */
  head: string;
  /** Where arrow bodies without braces started in it; they end at its `,`, `;` or closer. */
  arrows: number[];
  /** A `function` whose body has not opened yet. */
  pending: boolean;
  /** The head of the `(…)` that closed in it last, and that closer's token index. */
  call: string;
  closed: number;
};

const newFrame = (start: number, body: boolean, head: string): Frame => ({
  start,
  body,
  head,
  arrows: [],
  pending: false,
  call: '',
  closed: -2,
});

/** The innermost function body among `tokens` that holds `at`. */
function innermostBody(text: string, tokens: JsToken[], at: number): Span | null {
  const bodies: Span[] = [];
  const stack: Frame[] = [];
  let frame = newFrame(-1, false, '');
  const tokenAt = (k: number): JsToken | undefined => tokens[k];
  const charAt = (k: number): string => {
    const token = tokenAt(k);
    return token?.kind === 'punct' ? text.charAt(token.start) : '';
  };
  const endArrows = (end: number): void => {
    for (const start of frame.arrows) bodies.push({ start, end });
    frame.arrows = [];
  };
  for (let k = 0; k < tokens.length; k += 1) {
    const token = tokens[k];
    if (token === undefined) break;
    const prev = tokenAt(k - 1);
    const before = prev?.end ?? token.start;
    const char = charAt(k);
    const arrow =
      charAt(k - 1) === '>' && charAt(k - 2) === '=' && tokenAt(k - 2)?.end === prev?.start;
    if (arrow && char !== '{') frame.arrows.push(token.start);
    if (token.kind === 'word' && text.slice(token.start, token.end) === 'function') {
      frame.pending = true;
    }
    if (char === ',' || char === ';') endArrows(before);
    if (char === '(' || char === '[' || char === '{') {
      const method = frame.closed === k - 1 && frame.call !== '' && !CONTROL.has(frame.call);
      const body = char === '{' && (arrow || frame.pending || method);
      if (char === '{') frame.pending = false;
      const head = char === '(' && prev?.kind === 'word' ? text.slice(prev.start, prev.end) : '';
      stack.push(frame);
      frame = newFrame(token.start, body, head);
    } else if (char === ')' || char === ']' || char === '}') {
      endArrows(before);
      const outer = stack.pop();
      if (outer === undefined) continue;
      if (frame.body) bodies.push({ start: frame.start, end: token.end });
      outer.call = char === ')' ? frame.head : '';
      outer.closed = k;
      frame = outer;
    }
  }
  const end = tokens[tokens.length - 1]?.end ?? 0;
  for (let open: Frame | undefined = frame; open !== undefined; open = stack.pop()) {
    frame = open;
    endArrows(end);
  }
  const around = bodies.filter((body) => holds(body, at));
  return around.sort((a, b) => b.start - a.start)[0] ?? null;
}

/**
 * The body of the innermost function the element at `at` is written in: `{` to `}` of a
 * `function`, a method or an arrow, or the expression an arrow gives without braces (for
 * `=> (…)` the parentheses).
 */
export function functionBodyOf(text: string, at: number): Span | null {
  let body: Span | null = null;
  // Each region lies inside the one before it, so a later body is the inner one.
  for (const tokens of walkTo(text, at).regions) body = innermostBody(text, tokens, at) ?? body;
  return body;
}

/**
 * The names the parameters and declarations among `tokens` bind (added to `names.bound`). The
 * answer is the tokens that read nothing: those names, the keys of patterns, and types.
 */
function bindings(text: string, tokens: JsToken[], names: Names): Set<number> {
  const skip = new Set<number>();
  const wordAt = (k: number): string => {
    const token = tokens[k];
    return token?.kind === 'word' ? text.slice(token.start, token.end) : '';
  };
  const charAt = (k: number): string => {
    const token = tokens[k];
    return token?.kind === 'punct' ? text.charAt(token.start) : '';
  };
  const bind = (k: number): void => {
    names.bound.add(wordAt(k));
    skip.add(k);
  };
  /** The bracket that pairs with the one at `k`, walking by `step`; past the tokens if none. */
  const pairOf = (k: number, step: 1 | -1): number => {
    let depth = 0;
    for (let i = k; i >= 0 && i < tokens.length; i += step) {
      const char = charAt(i);
      if (char === '(' || char === '[' || char === '{') depth += step;
      if (char === ')' || char === ']' || char === '}') depth -= step;
      if (depth === 0) return i;
    }
    return step === 1 ? tokens.length : -1;
  };
  /** A parameter list or a destructuring pattern in the tokens `from` up to `to`. */
  const pattern = (from: number, to: number): void => {
    let mode: 'name' | 'type' | 'value' = 'name';
    let depth = 0;
    let inner = 0;
    for (let k = from; k < to; k += 1) {
      const char = charAt(k);
      const closes = char === ')' || char === ']' || char === '}';
      if (mode !== 'name' && !(inner === 0 && (char === ',' || closes))) {
        // Inside a type or a default value: types read no variable, a default's names do.
        if (char === '(' || char === '[' || char === '{') inner += 1;
        if (closes) inner -= 1;
        const starts = inner === 0 && char === '=' && charAt(k + 1) !== '>';
        if (mode === 'type' && starts) mode = 'value';
        else if (mode === 'type' && wordAt(k) !== '') skip.add(k);
        continue;
      }
      mode = 'name';
      if (char === '{' || char === '[') depth += 1;
      else if (char === '}' || char === ']') depth -= 1;
      else if (char === ':' && depth === 0) mode = 'type';
      else if (char === '=') mode = 'value';
      else if (wordAt(k) !== '' && depth > 0 && charAt(k + 1) === ':') skip.add(k);
      else if (wordAt(k) !== '') bind(k);
    }
  };
  for (let k = 0; k < tokens.length; k += 1) {
    const word = wordAt(k);
    if (charAt(k) === '=' && charAt(k + 1) === '>' && tokens[k]?.end === tokens[k + 1]?.start) {
      let last = k - 1;
      // `(x): T =>`: the return type is no name.
      if (wordAt(last) !== '' && charAt(last - 1) === ':' && charAt(last - 2) === ')') {
        skip.add(last);
        last -= 2;
      }
      if (charAt(last) === ')') pattern(pairOf(last, -1) + 1, last);
      else if (wordAt(last) !== '' && !KEYWORDS.has(wordAt(last))) bind(last);
    } else if (word === 'function') {
      const named = wordAt(k + 1) !== '';
      if (named) bind(k + 1);
      const open = named ? k + 2 : k + 1;
      if (charAt(open) === '(') pattern(open + 1, pairOf(open, 1));
    } else if (word === 'const' || word === 'let' || word === 'var') {
      if (wordAt(k + 1) !== '') bind(k + 1);
      else if (charAt(k + 1) === '{' || charAt(k + 1) === '[') {
        pattern(k + 1, pairOf(k + 1, 1) + 1);
      }
    }
  }
  return skip;
}

/** The names the JavaScript from `from` to its closing `}` reads, with the JSX inside it. */
function readJs(text: string, from: number, names: Names): void {
  const tokens = jsTokens(text, from, false);
  const skip = bindings(text, tokens, names);
  const charAt = (k: number): string => {
    const token = tokens[k];
    return token?.kind === 'punct' ? text.charAt(token.start) : '';
  };
  for (let k = 0; k < tokens.length; k += 1) {
    const token = tokens[k];
    if (token === undefined) break;
    if (token.kind === 'jsx') readElement(text, token.start, names);
    if (token.kind !== 'word' || skip.has(k)) continue;
    const name = text.slice(token.start, token.end);
    const prev = tokens[k - 1];
    const before = prev?.kind === 'word' ? text.slice(prev.start, prev.end) : '';
    // `a.name` reads only `a`, but `...name` reads `name`.
    const member = charAt(k - 1) === '.' && !text.startsWith('...', (prev?.start ?? 0) - 2);
    const key = (charAt(k - 1) === '{' || charAt(k - 1) === ',') && charAt(k + 1) === ':';
    const type = before === 'as' || before === 'satisfies';
    if (!/^\d/.test(name) && !member && !key && !type) names.read.add(name);
  }
}

/** The names the element at `at` reads: its tag when it is a variable, its props, its children. */
function readElement(text: string, at: number, names: Names): void {
  const open = isFragment(text, at) ? null : openAt(text, at);
  if (open !== null) {
    // `<Card.Header>` reads `Card`. A dotted tag reads its root whatever its case.
    const root = open.name.split(/[.:-]/)[0] ?? '';
    if (/^[A-Z]/.test(root) || open.name.includes('.')) names.read.add(root);
  }
  readParts(text, partsOf(text, at), names);
}

function readParts(text: string, parts: Child[], names: Names): void {
  for (const part of parts) {
    if (part.kind === 'element') readElement(text, part.span.start, names);
    else if (part.kind === 'expr') readJs(text, part.span.start + 1, names);
  }
}

/**
 * The names the code inside `span` reads but does not define there: identifiers in `{…}`
 * expressions and props, and capitalised tag roots (`Card` for `Card.Header`). Property names
 * after `.`, object keys and names bound inside the span (arrow parameters) are left out.
 * Sorted, each once.
 */
export function freeIdentifiers(text: string, span: Span): string[] {
  const names: Names = { read: new Set(), bound: new Set() };
  // The span is read as JSX children: one element, a run of siblings, or a `{…}`.
  readParts(text, readChildren(text, span.start, span.end), names);
  const free = [...names.read].filter((name) => !names.bound.has(name) && !KEYWORDS.has(name));
  return free.sort();
}
