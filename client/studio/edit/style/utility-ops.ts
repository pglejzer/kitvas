// The utility classes the editor writes in a Tailwind draft (spec 4c, goal 2; plan 16, task A):
// the class for a value, with the screen and state prefixes of the edit context (`md:hover:p-6`),
// and the `setUtility` op that adds, swaps or removes it. Pure: no DOM.
//
// The tables, the split of a class, the prefixes of a context and a token's name in a class are
// the server's own (`src/edit/domain/style/utilities.ts`, ADR 0080), so every class built here is
// one the server knows and reads back. A class is written as the project's Tailwind takes it
// (plan 29): its version's keyword classes, its prefix and its screens, as the inspect answer
// read them (`Inspect.tailwind`).

import { isBaseContext, sameContext } from '../../../../src/edit/domain/op-kinds.ts';
import { UTILITY } from '../../../../src/edit/domain/op-limits.ts';
import {
  coreOf,
  keywordClasses,
  keywordUtility,
  ownPrefixes,
  ownProperties,
  splitUtility,
  themeName,
  themeOrDefault,
  utilityIn,
} from '../../../../src/edit/domain/style/utilities.ts';
import { isKeywordProperty } from '../../../../src/edit/domain/types.ts';
import type {
  EditOp,
  StyleContext,
  StyleProperty,
  StyleValue,
  TokenOption,
} from '../../../../src/edit/index.ts';
import type { TailwindTheme } from '../../../../src/shared/values/tailwind-file.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { KIND } from '../props/values/kinds.ts';

export { splitUtility, utilityIn } from '../../../../src/edit/domain/style/utilities.ts';

/** The theme an inspect answer read its classes with: Tailwind 4's defaults when it names none. */
export const themeOf = (inspected: Pick<Inspect, 'tailwind'>): TailwindTheme =>
  themeOrDefault(inspected.tailwind);

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

/**
 * The class is the property's own utility in the project's Tailwind, so it may be swapped or
 * removed for it: `p-4` is `padding`'s, but for `padding-top` it sets three more sides and stays
 * where it is; `border` is `border-width`'s; Tailwind 3's `outline` is the style's, never the
 * width's. A class without the project's prefix is no one's.
 */
export function isOwn(property: StyleProperty, className: string, theme: TailwindTheme): boolean {
  const split = splitUtility(className, theme);
  if (split === null) return false;
  if (isKeywordProperty(property)) {
    return Object.values(keywordClasses(property, theme.version)).includes(coreOf(split.base));
  }
  return ownProperties(split.base, theme.version).includes(property);
}

/** `[13px]`, or `[length:13px]` where the prefix needs the type; `null` when it cannot be written. */
function arbitrary(property: StyleProperty, css: string): string | null {
  const text = css.trim().replace(/\s+/g, '_');
  if (text === '' || /[[\]]/.test(text)) return null;
  const hint = HINT[property];
  return hint === undefined ? `[${text}]` : `[${hint}:${text}]`;
}

/**
 * What follows the property's prefix for a value: the name of the theme key the token maps onto
 * (`md` of `--radius-md`), or an arbitrary value. A token mapped onto no key of the property's
 * namespace, or onto a name the prefix reads as another property (`text-sm` is a size, never a
 * colour), goes as its variable.
 */
function valuePart(
  property: StyleProperty,
  prefix: string,
  value: StyleValue,
  tokens: readonly TokenOption[],
  version: 3 | 4,
): string | null {
  if ('raw' in value) return arbitrary(property, value.raw);
  const token = tokens.find((each) => each.var === value.token);
  // Without the kit's token list its name is not known, and a guess would write a wrong class.
  if (token === undefined) return null;
  const name = themeName(property, token, version);
  const named = name !== null && ownProperties(`${prefix}${name}`, version).includes(property);
  return named ? name : arbitrary(property, `var(${token.var})`);
}

/**
 * The class that sets `property` to `value` in `context`: the theme key's name or an arbitrary
 * value after the property's prefix, a keyword's own class, under the context's prefixes and
 * with the project's prefix (`theme`). `null` for a value no class says (an image, a keyword
 * outside the list, an unknown token).
 */
export function utilityFor(
  property: StyleProperty,
  value: StyleValue,
  context: StyleContext,
  tokens: readonly TokenOption[],
  theme: TailwindTheme,
): string | null {
  let base: string | null = null;
  if (isKeywordProperty(property)) {
    base = 'raw' in value ? (keywordUtility(property, value.raw, theme.version) ?? null) : null;
  } else if (KIND[property] !== 'image') {
    const prefix = ownPrefixes(property)[0];
    const part =
      prefix === undefined ? null : valuePart(property, prefix, value, tokens, theme.version);
    base = prefix === undefined || part === null ? null : `${prefix}${part}`;
  }
  const className = base === null ? null : utilityIn(base, context, theme);
  return className !== null && UTILITY.test(className) ? className : null;
}

/** The class that sets the property in `context` now, as the inspect answer names it. */
export function currentUtility(
  inspected: Inspect,
  property: StyleProperty,
  context: StyleContext,
): string | null {
  if (isBaseContext(context)) {
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
  const theme = themeOf(inspected);
  const current = currentUtility(inspected, property, context);
  const before = current !== null && isOwn(property, current, theme) ? current : null;
  if (value === null) return before === null ? [] : [{ op: 'setUtility', id, value: null, before }];
  const next = utilityFor(property, value, context, tokens, theme);
  if (next === null || next === current) return [];
  return [{ op: 'setUtility', id, value: next, before }];
}
