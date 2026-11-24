// The string literal that renders the text a person saw (ADR 0060). An element whose only child is
// one `{…}` shows a value one of its operands gave (`expr/leaves.ts`): a string literal written
// there, or what the item of its copy holds where the operand reads the callback's parameter
// (`plan.action`, `feature`, a field a `({ title }) =>` pattern binds). The copy is named by its
// place in each list around the element (`nest.ts`). The one literal whose value is the text shown
// is the source; none or several is refused, and so is an operand whose value the editor cannot
// read (a call, a prop), as it may be the text: never a guess. Pure: text in, a span or a reason.

import { type Range, valueLeaves } from '../expr/leaves.ts';
import { childrenOf } from '../structure/subtree.ts';
import { jsTokens } from '../tsx/tsx-reader.ts';
import type { Refusal, Span } from '../types.ts';
import type { ListEdit } from './items.ts';
import { aroundOf, type ItemAt, itemsAt, readThrough } from './nest.ts';
import { charAt, closeOf, closes, opens, type Reader, type Region, wordAt } from './path.ts';
import { bindingOf } from './scope.ts';
import { decodeString, encodeString, fieldAt, valueToken } from './text.ts';

/** The literal that renders the text, or why there is not exactly one. */
export type TextSource = { span: Span } | { refused: Refusal };

/** A string literal of the file and its value. */
type Literal = { span: Span; value: string };

/**
 * What an operand gives: a string literal of the file; `none`, nothing that shows as the text
 * (`null`, a missing field, a page element); `unknown`, a value the editor cannot read, which may
 * be the text; `unread`, a read of an item the path does not name.
 */
type Given = Literal | 'none' | 'unknown' | 'unread';

/** Words that show nothing in JSX. */
const NOTHING = new Set(['null', 'undefined', 'true', 'false']);

/** What the operands may read: the scopes down to the element, and the copy's items. */
type Scope = { regions: Region[]; items: ItemAt[] | Refusal };

/** An operand that reads `name` or a field of it, at the offset `use`. */
type Read = { name: string; field: string | null; use: number };

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** The span of the element's only child when it is one `{…}`; `null` for anything else. */
export function onlyExpression(text: string, at: number): Span | null {
  const children = childrenOf(text, at);
  const only = children?.length === 1 ? children[0] : undefined;
  return only?.kind === 'expr' ? only.span : null;
}

/** The code of the `{…}` at `span` and its operands; `null` when every operand is an element. */
function operandsOf(text: string, span: Span): { expr: Region; leaves: Range[] } | null {
  const tokens = jsTokens(text, span.start + 1, false);
  const expr: Region = { text, tokens, span, root: -1 };
  const leaves = valueLeaves(expr, 0, tokens.length);
  const element = (leaf: Range): boolean =>
    leaf.to - leaf.from === 1 && tokens[leaf.from]?.kind === 'jsx';
  return leaves.every(element) ? null : { expr, leaves };
}

/**
 * The element's children are text and `{…}`, and no element; one `{…}` may show text (an
 * operand that is no element, as `{loading ? <Spinner /> : 'Save'}` has).
 */
export function showsExpression(text: string, at: number): boolean {
  const children = childrenOf(text, at) ?? [];
  if (children.some((child) => child.kind === 'element')) return false;
  return children.some((child) => child.kind === 'expr' && operandsOf(text, child.span) !== null);
}

/**
 * The `<` of the root element of each `.map` around the element at `at`, outer first: the
 * elements whose copies count the items. `[]` in no list; `null` when a list around it does not
 * render one such root per item (`aroundOf`).
 */
export function listRoots(text: string, at: number): number[] | null {
  const around = aroundOf(text, at);
  return around?.levels?.map((level) => level.root) ?? null;
}

/** The string literal at token `k`: quoted, or a template without `${…}`. */
function literalAt(reader: Reader, k: number): Literal | null {
  const token = reader.tokens[k];
  if (token?.kind !== 'literal') return null;
  const value = decodeString(reader.text.slice(token.start, token.end));
  return value === null ? null : { span: { start: token.start, end: token.end }, value };
}

/** The operand as `name`, `name.field` or `name?.field`, with the offset it is read at. */
function readOf(reader: Reader, leaf: Range): Read | null {
  const name = wordAt(reader, leaf.from);
  const use = reader.tokens[leaf.from]?.start ?? 0;
  if (!IDENTIFIER.test(name)) return null;
  if (leaf.to - leaf.from === 1) return { name, field: null, use };
  const dot = charAt(reader, leaf.from + 1) === '?' ? leaf.from + 2 : leaf.from + 1;
  const field = wordAt(reader, dot + 1);
  if (charAt(reader, dot) !== '.' || dot + 2 !== leaf.to || !IDENTIFIER.test(field)) return null;
  return { name, field, use };
}

/** A one-token operand that is no string: a word that shows nothing, a number, an element. */
function plainGiven(reader: Reader, k: number, shown: string): Given | null {
  const token = reader.tokens[k];
  if (token?.kind === 'jsx') {
    // A page element shows as an element, never as the text; a component may render text alone.
    return /^<[a-z]/.test(reader.text.slice(token.start, token.start + 2)) ? 'none' : 'unknown';
  }
  const word = wordAt(reader, k);
  if (NOTHING.has(word)) return 'none';
  if (/^\d/.test(word)) return String(Number(word)) === shown ? 'unknown' : 'none';
  return null;
}

/**
 * The item is an object literal of `key: value` entries only (no spread, no shorthand, no
 * computed key) without `key`: reading `key` of it gives `undefined`, which shows nothing.
 */
function lacks(at: ItemAt, key: string): boolean {
  const { reader } = at.array;
  const { first, last } = at.item;
  if (charAt(reader, first) !== '{' || closeOf(reader, first) !== last) return false;
  let depth = 0;
  for (let k = first + 1; k < last; k += 1) {
    const char = charAt(reader, k);
    const starts = k === first + 1 || charAt(reader, k - 1) === ',';
    if (depth === 0 && starts && charAt(reader, k + 1) !== ':') return false;
    if (opens(char)) depth += 1;
    else if (closes(char)) depth -= 1;
  }
  return fieldAt(reader, at.item, key) === null;
}

/**
 * What an operand gives (`Given`): its own literal, or the item's that its read of a callback's
 * parameter names. A call, a variable, a prop or a field that is no string literal is `unknown`.
 */
function givenBy(expr: Region, leaf: Range, scope: Scope, shown: string): Given {
  if (leaf.to - leaf.from === 1) {
    const own = literalAt(expr, leaf.from) ?? plainGiven(expr, leaf.from, shown);
    if (own !== null) return own;
  }
  const read = readOf(expr, leaf);
  if (read === null || bindingOf(scope.regions, read.name, read.use)?.kind !== 'param') {
    return 'unknown';
  }
  const { items } = scope;
  if (typeof items === 'string') return 'unread';
  // The innermost callback that binds the name, as in JavaScript.
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const level = items[index];
    const through = level === undefined ? null : readThrough(level.param, read.name, read.field);
    if (level === undefined || through === null) continue;
    if (through === 'unread') return 'unknown';
    const token = valueToken(level.array, level.item, through.key);
    if (token !== null) return literalAt(level.array.reader, token) ?? 'unknown';
    return through.key !== null && lacks(level, through.key) ? 'none' : 'unknown';
  }
  // A parameter of the component or of a callback that is no list: a value from outside.
  return 'unknown';
}

/**
 * The one string literal of `text` that renders `shown` in the element whose `<` is at `at`, for
 * the copy at `path` (its place in each list around the element, outer first). `no-text`: the
 * element's children are not one `{…}`. `computed`: no operand gives `shown` as a literal, or one
 * gives a value the editor cannot read. `ambiguous`: two literals give it. `list-item-gone` and
 * `not-found`: an operand reads an item the path no longer names.
 */
export function textSource(
  text: string,
  at: number,
  shown: string,
  path: readonly number[],
): TextSource {
  const child = onlyExpression(text, at);
  const operands = child === null ? null : operandsOf(text, child);
  if (operands === null) return { refused: 'no-text' };
  const around = aroundOf(text, at);
  if (around === null) return { refused: 'not-found' };
  const { expr, leaves } = operands;
  const items = around.levels === null ? 'computed' : itemsAt(around.levels, path);
  const scope: Scope = { regions: [...around.regions, expr], items };
  const found = new Map<number, Span>();
  const given = leaves.map((leaf) => givenBy(expr, leaf, scope, shown));
  if (given.includes('unread')) {
    // An item the path does not reach may hold the text: a list that changed, or one in code.
    return { refused: items === 'list-item-gone' || items === 'not-found' ? items : 'computed' };
  }
  // A value the editor cannot read may be the text itself: never a guess.
  if (given.includes('unknown')) return { refused: 'computed' };
  for (const literal of given) {
    if (typeof literal !== 'string' && literal.value === shown) {
      found.set(literal.span.start, literal.span);
    }
  }
  const [only, ...more] = [...found.values()];
  if (only === undefined) return { refused: 'computed' };
  return more.length === 0 ? { span: only } : { refused: 'ambiguous' };
}

/**
 * `value` in place of the one literal that renders `before` at `path`, in that literal's own
 * quotes; nothing else of the text changes. A refusal says why there is no one literal.
 */
export function writeTextSource(
  text: string,
  at: number,
  op: { value: string; before: string; path: readonly number[] },
): ListEdit | { refused: Refusal } {
  const found = textSource(text, at, op.before, op.path);
  if ('refused' in found) return found;
  if (op.value === op.before) return { text, moved: (old) => old };
  const { span } = found;
  const written = encodeString(op.value, text.charAt(span.start));
  const shift = written.length - (span.end - span.start);
  return {
    text: text.slice(0, span.start) + written + text.slice(span.end),
    moved: (old) => (old < span.start ? old : old >= span.end ? old + shift : null),
  };
}
