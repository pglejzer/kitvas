// The data list an element is rendered by (spec 4c, goal 9; plan 16, task D). From an element
// inside a `.map` callback, find the array it maps over: an inline array literal, or a `const`
// array of the same file bound once in the element's scope. Any other list (a prop, an import, a
// computed array) is read-only and says why. Pure: text in, a view of the array out.

import type { Refusal, Span } from '../types.ts';
import {
  type Callback,
  callbackOf,
  charAt,
  closeOf,
  closes,
  mapsAround,
  openOf,
  opens,
  type Reader,
  type Region,
  regionsTo,
  spanOf,
  wordAt,
} from './path.ts';
import { bindingOf, patternNames } from './scope.ts';

/** What a list maps over: a literal array the editor can change, or something it cannot. */
export type ListKind = 'literal' | 'prop' | 'import' | 'computed';

/** The inspect's `list` (`InspectSchema`): the kind, the literal's item count, the reason. */
export type ListInfo = { kind: ListKind; count: number | null; reason: Refusal | null };

/** One item of a literal array: its text, without the commas and the space around it. */
export type ItemView = { span: Span; first: number; last: number };

/** A literal array: the tokens it was read from, its brackets (token indexes) and its items. */
export type ArrayView = { reader: Reader; open: number; close: number; items: ItemView[] };

/**
 * The callback's first parameter: a name (`plan`), the fields a `{…}` pattern binds (local name
 * to key, `({ title }) =>`), or anything else.
 */
export type Param =
  | { kind: 'name'; name: string }
  | { kind: 'fields'; fields: ReadonlyMap<string, string> }
  | { kind: 'other' };

export type MappedList =
  | { kind: 'literal'; array: ArrayView; param: Param }
  | { kind: 'prop' | 'import' | 'computed' };

const COMPUTED: MappedList = { kind: 'computed' };
/** Words after which a `[` starts an array literal rather than reading an index. */
const BEFORE_VALUE = new Set(
  'return yield await case default typeof void delete throw new in of do else'.split(' '),
);
const KEYWORDS = new Set(['this', 'super', 'new', 'null', 'undefined', 'true', 'false']);
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** The items of the array literal whose `[` is token `open`; `null` for a hole or a spread. */
export function arrayAt(reader: Reader, open: number): ArrayView | null {
  const close = closeOf(reader, open);
  if (close < 0 || charAt(reader, open) !== '[') return null;
  const items: ItemView[] = [];
  let depth = 0;
  let first = -1;
  let last = -1;
  const flush = (): void => {
    items.push({ span: spanOf(reader, first, last), first, last });
    first = -1;
  };
  for (let k = open + 1; k < close; k += 1) {
    const char = charAt(reader, k);
    if (depth === 0 && char === ',') {
      // `[a, , b]`: a hole is no item the page renders.
      if (first < 0) return null;
      flush();
      continue;
    }
    if (opens(char)) depth += 1;
    else if (closes(char)) depth -= 1;
    if (first < 0) first = k;
    last = k;
  }
  if (first >= 0) flush();
  // `...OTHER` brings items from elsewhere: they are not this array's own.
  if (items.some((item) => charAt(reader, item.first) === '.')) return null;
  return { reader, open, close, items };
}

/** A `[` at token `open` starts a value (an array literal), not an index of what stands before. */
function startsValue(reader: Reader, open: number): boolean {
  const before = reader.tokens[open - 1];
  if (before === undefined) return true;
  if (before.kind === 'word') return BEFORE_VALUE.has(wordAt(reader, open - 1));
  if (before.kind !== 'punct') return false;
  const char = charAt(reader, open - 1);
  return char !== ')' && char !== ']';
}

/** After a `const` array's `]`: nothing that would make the value another one. */
function endsValue(reader: Reader, close: number): boolean {
  const after = reader.tokens[close + 1];
  if (after === undefined || after.kind === 'word') return true;
  const char = charAt(reader, close + 1);
  return char === ';' || char === ',' || char === '}';
}

/** The callback's first parameter, as `setItemText` reads the element's text through it. */
export function paramOf(reader: Reader, callback: Callback): Param {
  const names = patternNames(reader, callback.params.from, callback.params.to);
  const first = names.filter((bound) => bound.param === 0);
  const [only] = first;
  if (first.length === 1 && only !== undefined && only.depth === 0) {
    return { kind: 'name', name: only.name };
  }
  const fields = new Map<string, string>();
  for (const bound of first) if (bound.key !== null) fields.set(bound.name, bound.key);
  return fields.size > 0 ? { kind: 'fields', fields } : { kind: 'other' };
}

/**
 * The receiver `a.b.c` ending at token `end`: the first name and the length of the chain;
 * `null` when it reads anything but names (a call, an index, `this`).
 */
export function chainAt(reader: Reader, end: number): { root: number; length: number } | null {
  if (!IDENTIFIER.test(wordAt(reader, end))) return null;
  let root = end;
  let length = 1;
  // `a.b` or `a?.b`: a `.` right before the name, with a `?` before it when it is optional.
  while (charAt(reader, root - 1) === '.') {
    const name = charAt(reader, root - 2) === '?' ? root - 3 : root - 2;
    if (!IDENTIFIER.test(wordAt(reader, name))) return null;
    root = name;
    length += 1;
  }
  return KEYWORDS.has(wordAt(reader, root)) ? null : { root, length };
}

/** What the `.map` of `callback` in the last region maps over. */
export function receiverOf(regions: readonly Region[], callback: Callback): MappedList {
  const last = regions[regions.length - 1];
  if (last === undefined) return COMPUTED;
  let end = callback.dot - 1;
  if (charAt(last, end) === '?') end -= 1;
  const param = paramOf(last, callback);
  if (charAt(last, end) === ']') {
    const open = openOf(last, end);
    const array = open < 0 || !startsValue(last, open) ? null : arrayAt(last, open);
    return array === null ? COMPUTED : { kind: 'literal', array, param };
  }
  const chain = chainAt(last, end);
  if (chain === null) return COMPUTED;
  const use = last.tokens[chain.root]?.start ?? 0;
  const binding = bindingOf(regions, wordAt(last, chain.root), use);
  if (binding === null) return COMPUTED;
  if (binding.kind === 'import') return { kind: 'import' };
  if (binding.kind === 'param') return binding.nested ? COMPUTED : { kind: 'prop' };
  if (binding.kind !== 'const' || binding.array === null || chain.length !== 1) return COMPUTED;
  const array = arrayAt(binding.reader, binding.array);
  if (array === null || !endsValue(binding.reader, array.close)) return COMPUTED;
  return { kind: 'literal', array, param };
}

/**
 * The list the element whose `<` is at `at` is rendered by; `null` when no `.map` renders it.
 * Only an element in the JSX the callback returns, reached through elements, inside exactly one
 * `.map`, is one copy per item; any other one is `computed`.
 */
export function findList(text: string, at: number): MappedList | null {
  const regions = regionsTo(text, at);
  const last = regions[regions.length - 1];
  if (last === undefined) return null;
  const around = mapsAround(regions, at);
  if (around === 0) return null;
  const callback = callbackOf(last, last.root);
  if (callback === null || around !== 1) return COMPUTED;
  return receiverOf(regions, callback);
}

/** The inspect's `list` for the element at `at`; `null` when no `.map` renders it. */
export function listInfo(text: string, at: number): ListInfo | null {
  const list = findList(text, at);
  if (list === null) return null;
  if (list.kind === 'literal') {
    return { kind: 'literal', count: list.array.items.length, reason: null };
  }
  return { kind: list.kind, count: null, reason: 'list-not-literal' };
}
