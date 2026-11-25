// One list item's own class (ADR 0072). The copies a `.map` renders share one JSX element, so a
// style written to its class shows on every copy. "This item" gives one copy a modifier of that
// class named by the list's key: `plans__card--pro` from `key={plan.id}`. The key of the innermost
// list around the element is read (`nest.ts`): it must be `{name.field}` through that list's
// callback parameter (or `{name}` for a field a `({ id }) =>` pattern binds), with the name bound
// nowhere else on the way in, and every copy (each item of every array that list maps over, one
// per outer item in a list inside another) must hold that field as a string literal that makes a
// class name, no two the same. The modifier is written once into the element's `className` as a
// template literal that reads the same field, so each copy carries its own. Pure: text in, a
// class, a new text or a reason out.

import { constantClass } from '../expr/class-start.ts';
import { CLASS_NAME } from '../ops.ts';
import { jsTokens, openAt, trimSpan } from '../tsx/tsx-reader.ts';
import type { Refusal, Span } from '../types.ts';
import type { ArrayView, ItemView } from './find.ts';
import type { ListEdit } from './items.ts';
import { aroundOf, innerArrayAt, itemsAt, type Level, readThrough } from './nest.ts';
import { charAt, closeOf, type Reader } from './path.ts';
import { bindingOf } from './scope.ts';
import { stringAt, valueToken } from './text.ts';

/**
 * The class of the copy (`plans__card--pro`), the code of the key its template reads
 * (`plan.id`), and whether the element's `className` gives that modifier already.
 */
export type ItemClass = { className: string; expr: string; inTsx: boolean };

/** A key value that makes a class part. */
const PART = /^[A-Za-z0-9_-]+$/;
/** What a key may read: a name, or a name and one field of it. */
const KEY_READ = /^([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?$/;
/**
 * What a JSX string may not hold to become a template literal: a backtick, a backslash and `${`
 * mean something else there, and JSX reads `&` as the start of an entity.
 */
const NOT_IN_TEMPLATE = /[`\\&]|\$\{/;

/** A list root's `key`: its code, the name and the field it reads, and where the name stands. */
type Key = { expr: string; name: string; field: string | null; use: number };

/** The `key` of the element at `at` when it is one `{name}` or `{name.field}`; `null` otherwise. */
function keyOf(text: string, at: number): Key | null {
  const keys = openAt(text, at)?.attrs.filter((attr) => attr.name === 'key') ?? [];
  const value = keys.length === 1 ? keys[0]?.value : null;
  if (value === null || value === undefined || text.charAt(value.start) !== '{') return null;
  const inner = trimSpan(text, { start: value.start + 1, end: value.end - 1 });
  const expr = text.slice(inner.start, inner.end);
  const read = KEY_READ.exec(expr);
  const name = read?.[1];
  if (read === null || name === undefined) return null;
  return { expr, name, field: read[2] ?? null, use: inner.start };
}

/** The modifier as the template writes it: `plans__card--${plan.id}`. */
const modifierOf = (base: string, expr: string): string => `${base}--\${${expr}}`;

/**
 * The value span of the element's `className` (with its quotes or braces); `null` when it has
 * none. `ambiguous`: two of them; `invalid`: a `className` without a value.
 */
function classValue(text: string, at: number): Span | null | Refusal {
  const open = openAt(text, at);
  if (open === null) return 'not-found';
  const found = open.attrs.filter((attr) => attr.name === 'className');
  if (found.length > 1) return 'ambiguous';
  const [attr] = found;
  if (attr === undefined) return null;
  return attr.value ?? 'invalid';
}

/** The value of `field` in `item` when it makes a class name after `base--`; `null` otherwise. */
function classPartOf(array: ArrayView, item: ItemView, field: string, base: string): string | null {
  const token = valueToken(array, item, field);
  const value = token === null ? null : stringAt(array.reader, token);
  if (value === null || !PART.test(value) || !CLASS_NAME.test(`${base}--${value}`)) return null;
  return value;
}

/** The most items `allNamed` reads: a longer list has no item scope. */
const MAX_READ = 10_000;

/**
 * Every copy of the element has a value of `field`, and no two share one (one class would then
 * style two items): each item of every array the innermost list maps over, that is one array
 * per outer item when the list is inside another.
 */
function allNamed(levels: readonly Level[], field: string, base: string): boolean {
  const seen = new Set<string>();
  const walk = (parents: readonly number[]): boolean => {
    const depth = parents.length;
    if (depth === levels.length - 1) {
      const array = innerArrayAt(levels, parents);
      if (typeof array === 'string') return false;
      for (const item of array.items) {
        const value = classPartOf(array, item, field, base);
        if (value === null || seen.has(value) || seen.size >= MAX_READ) return false;
        seen.add(value);
      }
      return true;
    }
    // The outer list at this depth, read through its first item: an empty one renders no copy.
    const outer = itemsAt(levels.slice(0, depth + 1), [...parents, 0]);
    if (outer === 'list-item-gone') return true;
    if (typeof outer === 'string') return false;
    const count = outer[depth]?.array.items.length ?? 0;
    for (let place = 0; place < count; place += 1) {
      if (!walk([...parents, place])) return false;
    }
    return true;
  };
  return walk([]);
}

/**
 * The own class of the copy at `path` (its place in each list around the element, outer first)
 * of the element whose `<` is at `at`, whose style class is `base`. `not-list-item`: no list
 * renders it; `computed`: a list around it renders no one root per item; `item-key`: the key
 * gives no usable name; the refusals of `itemsAt` when the path names no copy.
 */
export function itemClassAt(
  text: string,
  at: number,
  path: readonly number[],
  base: string,
): ItemClass | Refusal {
  const around = aroundOf(text, at);
  if (around === null) return 'not-found';
  const { levels } = around;
  if (levels === null) return 'computed';
  const level = levels[levels.length - 1];
  if (level === undefined) return 'not-list-item';
  const items = itemsAt(levels, path);
  if (typeof items === 'string') return items;
  const own = items[items.length - 1];
  const key = keyOf(text, level.root);
  if (own === undefined || key === null) return 'item-key';
  // The innermost callback's parameter, not a name declared between it and its root.
  if (bindingOf(level.regions, key.name, key.use)?.kind !== 'param') return 'item-key';
  const read = readThrough(own.param, key.name, key.field);
  if (read === null || read === 'unread' || read.key === null) return 'item-key';
  // The element reads the name too: nothing inside the item may name it again.
  const inside = around.regions.slice(level.regions.length);
  if (inside.length > 0 && bindingOf(inside, key.name, at) !== null) return 'item-key';
  const value = classPartOf(own.array, own.item, read.key, base);
  if (value === null || !allNamed(levels, read.key, base)) return 'item-key';
  const source = classValue(text, at);
  const written =
    source === null || typeof source === 'string' ? '' : text.slice(source.start, source.end);
  return {
    className: `${base}--${value}`,
    expr: key.expr,
    inTsx: written.includes(modifierOf(base, key.expr)),
  };
}

/**
 * The offset of the closing backtick when the tokens of `reader` are exactly one template
 * literal (a `${…}` holds any code, other templates too); `null` otherwise.
 */
function templateClose(reader: Reader): number | null {
  const { text, tokens } = reader;
  const first = tokens[0];
  if (first?.kind !== 'literal' || text.charAt(first.start) !== '`') return null;
  let k = 0;
  for (let guard = 0; guard < tokens.length; guard += 1) {
    const token = tokens[k];
    if (token?.kind !== 'literal') return null;
    // A part ends at the closing backtick, or at the `$` of the next `${`; the first part holds
    // the opening backtick as well.
    const length = token.end - token.start;
    if (text.charAt(token.end - 1) === '`' && length >= (k === 0 ? 2 : 1)) {
      return k === tokens.length - 1 ? token.end - 1 : null;
    }
    if (charAt(reader, k + 1) !== '{') return null;
    const close = closeOf(reader, k + 1);
    if (close < 0) return null;
    k = close + 1;
  }
  return null;
}

/** `insert` in place of `span`, and where each old offset went. */
function spliced(text: string, span: Span, insert: string): ListEdit {
  const shift = insert.length - (span.end - span.start);
  return {
    text: text.slice(0, span.start) + insert + text.slice(span.end),
    moved: (old) => (old < span.start ? old : old >= span.end ? old + shift : null),
  };
}

/**
 * The element at `at` with `base--${expr}` added to its `className`, the attribute's value alone
 * rewritten: a string becomes a template literal (`"a"` → `` {`a base--${expr}`} ``), a template
 * gets it before its closing backtick, any other expression is wrapped (`` {`${cond ? 'a' : 'b'}
 * base--${expr}`} ``). A `className` that gives it already comes back as it is. `no-classname`:
 * the element has none; `invalid`: a string a template would read otherwise.
 */
export function addItemClassText(
  text: string,
  at: number,
  base: string,
  expr: string,
): ListEdit | { refused: Refusal } {
  const value = classValue(text, at);
  if (value === null) return { refused: 'no-classname' };
  if (typeof value === 'string') return { refused: value };
  const modifier = modifierOf(base, expr);
  if (text.slice(value.start, value.end).includes(modifier)) return { text, moved: (old) => old };
  const opener = text.charAt(value.start);
  if (opener === '"' || opener === "'") {
    const inner = text.slice(value.start + 1, value.end - 1);
    if (NOT_IN_TEMPLATE.test(inner)) return { refused: 'invalid' };
    const classes = inner === '' ? modifier : `${inner} ${modifier}`;
    return spliced(text, value, `{\`${classes}\`}`);
  }
  if (opener !== '{') return { refused: 'invalid' };
  const inner = trimSpan(text, { start: value.start + 1, end: value.end - 1 });
  if (inner.start === inner.end) return { refused: 'invalid' };
  const tick = templateClose({ text, tokens: jsTokens(text, inner.start, false) });
  if (tick !== null) return spliced(text, { start: tick, end: tick }, ` ${modifier}`);
  const code = text.slice(inner.start, inner.end);
  return spliced(text, inner, `\`\${${code}} ${modifier}\``);
}

/**
 * The class every value of a `className` template gives when the template starts with one
 * `${…}` (the form `addItemClassText` writes around an expression): the inner code's constant
 * first class (`constantClass`, ADR 0060), when a space or the closing backtick follows its `}`.
 * `null` for anything else.
 */
export function wrappedClass(source: string): string | null {
  const reader: Reader = { text: source, tokens: jsTokens(source, 0, true) };
  const first = reader.tokens[0];
  if (first?.kind !== 'literal' || source.slice(first.start, first.end) !== '`$') return null;
  if (templateClose(reader) === null || charAt(reader, 1) !== '{') return null;
  const close = closeOf(reader, 1);
  const open = reader.tokens[1];
  const end = reader.tokens[close];
  const after = reader.tokens[close + 1];
  if (open === undefined || end === undefined || after === undefined) return null;
  // A space after the `}` ends the inner value's last class; text right after it would go on.
  const next = source.charAt(after.start);
  if (next !== '`' && !/\s/.test(next)) return null;
  return constantClass(source.slice(open.end, end.start));
}
