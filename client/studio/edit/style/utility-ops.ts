// The utility classes the editor writes in a Tailwind draft (spec 4c, goal 2; plan 16, task A):
// the class for a value, with the screen and state prefixes of the edit context (`md:hover:p-6`),
// and the `setUtility` op that adds, swaps or removes it. Pure: no DOM.
//
// The client may not import values from `src/`, so the tables are copies of `TAILWIND_SCREENS`,
// `KEYWORD_UTILITY` and `ownPrefixes` in `src/edit/domain/style/utilities.ts`;
// `test/client/studio/utility-ops.test.ts` keeps them equal.

import type {
  EditOp,
  StyleContext,
  StyleProperty,
  StyleValue,
  TokenOption,
} from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { KIND } from '../props/kinds.ts';

export const SCREENS: Readonly<Record<string, number>> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

export const KEYWORD_CLASS: Readonly<Partial<Record<StyleProperty, Record<string, string>>>> = {
  display: {
    block: 'block',
    flex: 'flex',
    grid: 'grid',
    inline: 'inline',
    'inline-block': 'inline-block',
    'inline-flex': 'inline-flex',
    none: 'hidden',
  },
  'flex-direction': {
    row: 'flex-row',
    'row-reverse': 'flex-row-reverse',
    column: 'flex-col',
    'column-reverse': 'flex-col-reverse',
  },
  'flex-wrap': { nowrap: 'flex-nowrap', wrap: 'flex-wrap' },
  'justify-content': {
    'flex-start': 'justify-start',
    center: 'justify-center',
    'flex-end': 'justify-end',
    'space-between': 'justify-between',
    'space-around': 'justify-around',
    'space-evenly': 'justify-evenly',
  },
  'align-items': {
    stretch: 'items-stretch',
    'flex-start': 'items-start',
    center: 'items-center',
    'flex-end': 'items-end',
    baseline: 'items-baseline',
  },
  'align-self': {
    auto: 'self-auto',
    stretch: 'self-stretch',
    'flex-start': 'self-start',
    center: 'self-center',
    'flex-end': 'self-end',
  },
  'text-align': {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
    justify: 'text-justify',
  },
  'border-style': {
    none: 'border-none',
    solid: 'border-solid',
    dashed: 'border-dashed',
    dotted: 'border-dotted',
  },
  'outline-style': {
    none: 'outline-none',
    solid: 'outline-solid',
    dashed: 'outline-dashed',
    dotted: 'outline-dotted',
  },
  'background-size': { auto: 'bg-auto', cover: 'bg-cover', contain: 'bg-contain' },
};

/**
 * The prefixes that are each token property's own utility, the one a new class gets first; a
 * name without the trailing `-` is a whole class (`border` is a 1px border).
 */
export const OWN_PREFIXES: Readonly<Partial<Record<StyleProperty, readonly string[]>>> = {
  padding: ['p-'],
  'padding-block': ['py-'],
  'padding-inline': ['px-'],
  margin: ['m-'],
  'margin-block': ['my-'],
  'margin-inline': ['mx-'],
  gap: ['gap-'],
  color: ['text-'],
  'background-color': ['bg-'],
  'border-color': ['border-'],
  'font-size': ['text-'],
  'font-weight': ['font-'],
  'line-height': ['leading-'],
  'border-radius': ['rounded-', 'rounded'],
  'border-width': ['border-', 'border'],
  width: ['w-'],
  height: ['h-'],
  'padding-top': ['pt-'],
  'padding-right': ['pr-'],
  'padding-bottom': ['pb-'],
  'padding-left': ['pl-'],
  'margin-top': ['mt-'],
  'margin-right': ['mr-'],
  'margin-bottom': ['mb-'],
  'margin-left': ['ml-'],
  'outline-color': ['outline-'],
  'outline-width': ['outline-', 'outline'],
  'background-image': ['bg-'],
  'min-width': ['min-w-'],
  'min-height': ['min-h-'],
};

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

/** What a utility class may hold (`UTILITY` in `src/edit/domain/ops.ts`). */
const UTILITY = /^[A-Za-z0-9:_\-[\]/.#%(),]{1,120}$/;

/** `md:hover:p-6` is `p-6` under `md` and `hover`; a `:` inside `[…]` or `(…)` is the value's. */
export function splitUtility(className: string): { variants: string[]; base: string } {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < className.length; at += 1) {
    const char = className.charAt(at);
    if (char === '[' || char === '(') depth += 1;
    else if ((char === ']' || char === ')') && depth > 0) depth -= 1;
    else if (char === ':' && depth === 0) {
      parts.push(className.slice(from, at));
      from = at + 1;
    }
  }
  return { variants: parts, base: className.slice(from) };
}

/** The prefixes of a context, the screen first: `md:hover:`; none for the base. */
export function variantPrefix(context: StyleContext): string {
  const { width, state } = context;
  const named = Object.keys(SCREENS).find((name) => SCREENS[name] === width);
  const screen = width === null ? '' : `${named ?? `min-[${width}px]`}:`;
  return state === null ? screen : `${screen}${state}:`;
}

/**
 * The class is the property's own utility, so it may be swapped or removed for it: `p-4` is
 * `padding`'s, but for `padding-top` it sets three more sides and stays where it is.
 */
export function isOwn(property: StyleProperty, className: string): boolean {
  const core = splitUtility(className).base.replace(/^!/, '').replace(/!$/, '').replace(/^-/, '');
  const words = Object.values(KEYWORD_CLASS[property] ?? {});
  if (words.length > 0) return words.includes(core);
  return (OWN_PREFIXES[property] ?? []).some((prefix) =>
    prefix.endsWith('-') ? core.length > prefix.length && core.startsWith(prefix) : core === prefix,
  );
}

/** The name a token has in a utility: `color.primaryForeground` is `primary-foreground`. */
export function tokenName(path: string): string {
  const parts = path.split('.');
  return (parts.length > 1 ? parts.slice(1) : parts)
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase())
    .join('-');
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
    const prefix = OWN_PREFIXES[property]?.[0];
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
