// The utility classes the editor writes in a Tailwind draft (spec 4c, goal 2; plan 16, task A):
// the class for a value, with the screen and state prefixes of the edit context (`md:hover:p-6`),
// and the `setUtility` op that adds, swaps or removes it. Pure: no DOM.
//
// The tables, the split of a class, the prefixes of a context and a token's name in a class are
// the server's own (`src/edit/domain/style/utilities.ts`, ADR 0080), so every class built here is
// one the server knows and reads back.

import { UTILITY } from '../../../../src/edit/domain/op-limits.ts';
import {
  coreOf,
  KEYWORD_UTILITY,
  ownPrefixes,
  splitUtility,
  tokenName,
  variantPrefix,
} from '../../../../src/edit/domain/style/utilities.ts';
import type {
  EditOp,
  StyleContext,
  StyleProperty,
  StyleValue,
  TokenOption,
} from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { KIND } from '../props/kinds.ts';

export { splitUtility, variantPrefix } from '../../../../src/edit/domain/style/utilities.ts';

/** The class of each keyword of a keyword property, read by any property (none for the rest). */
const KEYWORD_CLASS: Readonly<Partial<Record<StyleProperty, Readonly<Record<string, string>>>>> =
  KEYWORD_UTILITY;

/** How an arbitrary value says its type where a prefix has two meanings (`text-[color:…]`). */
const HINT: Readonly<Partial<Record<StyleProperty, string>>> = {
  color: 'color',
  'background-color': 'color',
  'border-color': 'color',
  'outline-color': 'color',
  'font-size': 'length',
  'border-width': 'length',
  'outline-width': 'length',
  'font-weight': 'number',
};

/** The token names a shared prefix reads as its own property; another name goes as a variable. */
const NAMED: Readonly<Partial<Record<StyleProperty, RegExp>>> = {
  'font-size': /^(?:xs|sm|base|lg|xl|[2-9]xl)$/,
  'font-weight': /^(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\d+)$/,
  'border-width': /^\d+$/,
  'outline-width': /^\d+$/,
};

/** Names `text-`, `bg-`, `border-` and `outline-` read as something other than a colour. */
const OTHER_WORDS = [
  'xs sm base lg xl left center right justify start end wrap nowrap balance pretty ellipsis',
  'clip fixed local scroll auto cover contain none repeat no-repeat top bottom solid dashed',
  'dotted double hidden collapse separate shadow x y t r b l e s',
]
  .join(' ')
  .split(' ');
const OTHER_STARTS = [
  'shadow opacity clip origin gradient linear radial conic blend position size repeat',
  'top bottom left right spacing offset x y t r b l e s',
]
  .join(' ')
  .split(' ');

function notAColor(name: string): boolean {
  if (/^(?:\d+|[2-9]xl)$/.test(name) || OTHER_WORDS.includes(name)) return true;
  return OTHER_STARTS.some((start) => name.startsWith(`${start}-`));
}

/**
 * The class is the property's own utility, so it may be swapped or removed for it: `p-4` is
 * `padding`'s, but for `padding-top` it sets three more sides and stays where it is. A name
 * without the trailing `-` is a whole class (`border` is a 1px border).
 */
export function isOwn(property: StyleProperty, className: string): boolean {
  const core = coreOf(splitUtility(className).base);
  const words = Object.values(KEYWORD_CLASS[property] ?? {});
  if (words.length > 0) return words.includes(core);
  return ownPrefixes(property).some((prefix) =>
    prefix.endsWith('-') ? core.length > prefix.length && core.startsWith(prefix) : core === prefix,
  );
}

/** `[13px]`, or `[length:13px]` where the prefix needs the type; `null` when it cannot be written. */
function arbitrary(property: StyleProperty, css: string): string | null {
  const text = css.trim().replace(/\s+/g, '_');
  if (text === '' || /[[\]]/.test(text)) return null;
  const hint = HINT[property];
  return hint === undefined ? `[${text}]` : `[${hint}:${text}]`;
}

/** What follows the property's prefix for a value: a token's name, or an arbitrary value. */
function valuePart(
  property: StyleProperty,
  value: StyleValue,
  tokens: readonly TokenOption[],
): string | null {
  if ('raw' in value) return arbitrary(property, value.raw);
  const token = tokens.find((each) => each.var === value.token);
  // Without the kit's token list its name is not known, and a guess would write a wrong class.
  if (token === undefined) return null;
  const name = tokenName(token.path);
  const named = NAMED[property];
  const misread = HINT[property] === 'color' && notAColor(name);
  const readable = named === undefined ? !misread : named.test(name);
  return readable && /^[a-z0-9-]+$/.test(name) ? name : arbitrary(property, `var(${token.var})`);
}

/**
 * The class that sets `property` to `value` in `context`: the kit's token name or an arbitrary
 * value after the property's prefix, a keyword's own class, under the context's prefixes. `null`
 * for a value no class says (an image, a keyword outside the list, an unknown token).
 */
export function utilityFor(
  property: StyleProperty,
  value: StyleValue,
  context: StyleContext,
  tokens: readonly TokenOption[],
): string | null {
  const kind = KIND[property];
  let base: string | null = null;
  if (kind === 'keyword') {
    base = 'raw' in value ? (KEYWORD_CLASS[property]?.[value.raw] ?? null) : null;
  } else if (kind !== 'image') {
    const prefix = ownPrefixes(property)[0];
    const part = prefix === undefined ? null : valuePart(property, value, tokens);
    base = prefix === undefined || part === null ? null : `${prefix}${part}`;
  }
  const className = base === null ? null : `${variantPrefix(context)}${base}`;
  return className !== null && UTILITY.test(className) ? className : null;
}

const sameContext = (a: StyleContext, b: StyleContext): boolean =>
  a.width === b.width && a.state === b.state;

/** The class that sets the property in `context` now, as the inspect answer names it. */
export function currentUtility(
  inspected: Inspect,
  property: StyleProperty,
  context: StyleContext,
): string | null {
  if (context.width === null && context.state === null) {
    const source = inspected.styles[property];
    return source?.kind === 'utility' ? source.className : null;
  }
  const found = (inspected.overrides ?? []).find(
    (each) => each.property === property && sameContext(each.context, context),
  );
  return found?.utility ?? null;
}

/**
 * The op that sets (or, with `null`, removes) the property's utility in `context`. A class that
 * is the property's own is swapped in its place; any other one stays and the new class is added.
 */
export function opsForUtility(
  inspected: Inspect,
  property: StyleProperty,
  value: StyleValue | null,
  context: StyleContext,
  tokens: readonly TokenOption[],
): EditOp[] {
  const { id } = inspected;
  const current = currentUtility(inspected, property, context);
  const before = current !== null && isOwn(property, current) ? current : null;
  if (value === null) return before === null ? [] : [{ op: 'setUtility', id, value: null, before }];
  const next = utilityFor(property, value, context, tokens);
  if (next === null || next === current) return [];
  return [{ op: 'setUtility', id, value: next, before }];
}
