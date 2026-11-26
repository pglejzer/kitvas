// The utility classes of a Tailwind draft under a width or a state (spec 4c, goal 2): `md:p-6`,
// `hover:bg-primary`, `md:hover:p-6`. A class without a variant is the base and is read by
// `source.ts`; here are the variants kitvas writes, the override each prefixed class is, and
// whether a class is one kitvas knows. The studio builds the classes from these tables
// (`client/studio/edit/style/utility-ops.ts`), so this file stays package-free (ADR 0080).

import { MAX_BREAKPOINT, STYLE_STATES, type StyleState } from '../op-limits.ts';
import type { StyleContext } from '../ops.ts';
import {
  isKeywordProperty,
  type KeywordProperty,
  STYLE_PROPERTIES,
  type StyleProperty,
  type TokenOption,
  tokenTypeOf,
} from '../types.ts';
import { UTILITY_PREFIXES, utilityAmong, utilityMatches } from './source.ts';

/** Tailwind's own screens, by their min width in px. A kit cannot declare others yet. */
export const TAILWIND_SCREENS: Readonly<Record<string, number>> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

/** The class each keyword of a keyword property is written as. */
export const KEYWORD_UTILITY: Record<KeywordProperty, Readonly<Record<string, string>>> = {
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

/** The utility itself: `!p-4` and `p-4!` are important, `-mt-2` is a negative margin. */
export const coreOf = (base: string): string =>
  base.replace(/^!/, '').replace(/!$/, '').replace(/^-/, '');

/** The min width a screen variant stands for: a Tailwind screen, or `min-[900px]`. */
function screenWidth(variant: string): number | null {
  if (Object.hasOwn(TAILWIND_SCREENS, variant)) return TAILWIND_SCREENS[variant] ?? null;
  const width = Number(/^min-\[([1-9]\d{0,4})px\]$/.exec(variant)?.[1] ?? Number.NaN);
  return Number.isInteger(width) && width <= MAX_BREAKPOINT ? width : null;
}

/** The screen variant of a width: Tailwind's name for it (`md`), else `min-[900px]`. */
export function screenOf(width: number): string {
  const named = Object.keys(TAILWIND_SCREENS).find((name) => TAILWIND_SCREENS[name] === width);
  return named ?? `min-[${width}px]`;
}

/**
 * The context a class's variants stand for: at most one screen and one state, in any order.
 * `null` for any other variant (`dark`, `group-hover`, two screens): kitvas does not write those.
 */
export function contextOfVariants(variants: readonly string[]): StyleContext | null {
  let width: number | null = null;
  let state: StyleState | null = null;
  for (const variant of variants) {
    const screen = screenWidth(variant);
    const named: StyleState | undefined = STYLE_STATES.find((name) => name === variant);
    if (screen !== null && width === null) width = screen;
    else if (named !== undefined && state === null) state = named;
    else return null;
  }
  return { width, state };
}

/** The prefixes of a context, the screen first: `md:hover:`; none for the base. */
export function variantPrefix(context: StyleContext): string {
  const screen = context.width === null ? '' : `${screenOf(context.width)}:`;
  return context.state === null ? screen : `${screen}${context.state}:`;
}

/**
 * The prefixes that are the property's own utility: `p-` for `padding`, not the `px-` that sets a
 * part of it; every class of a keyword property; a whole class such as `border`.
 */
export function ownPrefixes(property: StyleProperty): string[] {
  return UTILITY_PREFIXES[property].filter(
    (prefix, at) => at === 0 || !prefix.endsWith('-') || isKeywordProperty(property),
  );
}

/** The properties a utility (without variants) is the own utility of: `p-4` is `padding`'s. */
export function ownProperties(base: string): StyleProperty[] {
  const core = coreOf(base);
  return STYLE_PROPERTIES.filter((property) =>
    ownPrefixes(property).some((prefix) => utilityMatches(property, prefix, core)),
  );
}

/**
 * A class kitvas may write: it sets a property of the editor's set, and its variants are a screen,
 * a state or both.
 */
export function knownUtility(className: string): boolean {
  const { variants, base } = splitUtility(className);
  if (contextOfVariants(variants) === null) return false;
  const core = coreOf(base);
  return STYLE_PROPERTIES.some((property) =>
    UTILITY_PREFIXES[property].some((prefix) => utilityMatches(property, prefix, core)),
  );
}

/** The name a token has in a utility: `color.primaryForeground` is `primary-foreground`. */
export function tokenName(path: string): string {
  const parts = path.split('.');
  return (parts.length > 1 ? parts.slice(1) : parts)
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase())
    .join('-');
}

/** A value a prefixed utility sets, as the inspect answer lists it. */
export type UtilityOverride = {
  context: StyleContext;
  property: StyleProperty;
  /** A token as `var(--kit-…)`, a keyword, the inside of `[…]`, else the utility's own value. */
  value: string;
  /** An arbitrary value that names no kit token. */
  offKit: boolean;
  utility: string;
};

const KIT_VAR = /^var\((--kit-[A-Za-z0-9_-]+)\)$/;

/**
 * The token group a property's utility names first, by the group's first word: `p-md` is
 * `space.md` before `radius.md`, as Tailwind reads `--spacing-*` for padding.
 */
const GROUP_OF: readonly [property: RegExp, group: RegExp][] = [
  [/^(?:padding|margin|gap)/, /^spac/],
  [/radius$/, /^(?:radius|rounded)/],
  [/^font-size$/, /^(?:font-?size|text)/],
  [/^line-height$/, /^(?:line-?height|leading)/],
  // `min-width` and `min-height` read the size scale, not the border widths below (ADR 0061).
  [/^(?:min-)?(?:width|height)$/, /^siz/],
  [/-width$/, /^(?:border|stroke|outline)/],
];

/** The kit token of the property's type that a utility's value names; `undefined` without one. */
function namedToken(
  property: StyleProperty,
  name: string,
  tokens: readonly TokenOption[],
): TokenOption | undefined {
  const type = tokenTypeOf(property);
  const named = tokens.filter((each) => each.type === type && tokenName(each.path) === name);
  const group = GROUP_OF.find(([fits]) => fits.test(property))?.[1];
  const first = (each: TokenOption): string => (each.path.split('.')[0] ?? '').toLowerCase();
  return named.find((each) => group?.test(first(each)) === true) ?? named[0];
}

/** What the utility `core` holds for `property`, once it is known to set it. */
function shownValueOf(
  property: StyleProperty,
  core: string,
  tokens: readonly TokenOption[],
): { value: string; offKit: boolean } {
  if (isKeywordProperty(property)) {
    const words = KEYWORD_UTILITY[property];
    const keyword = Object.keys(words).find((word) => words[word] === core);
    return { value: keyword ?? core, offKit: false };
  }
  const prefix = UTILITY_PREFIXES[property].find((each) => utilityMatches(property, each, core));
  const rest = prefix?.endsWith('-') ? core.slice(prefix.length) : '';
  if (rest.startsWith('[') && rest.endsWith(']')) {
    // `[length:13px]` says its type first; `_` stands for a space.
    const inner = rest
      .slice(1, -1)
      .replace(/^[a-z-]+:/, '')
      .replace(/_/g, ' ');
    const named = KIT_VAR.exec(inner)?.[1];
    return { value: inner, offKit: !tokens.some((token) => token.var === named) };
  }
  const token = namedToken(property, rest, tokens);
  if (token !== undefined) return { value: `var(${token.var})`, offKit: false };
  return { value: rest === '' ? core : rest, offKit: false };
}

/**
 * Every value the classes set under a width or a state, for the properties of the editor's set.
 * Within one context a property takes its class as the base does (`utilityAmong`).
 */
export function utilityOverrides(
  classes: readonly string[],
  tokens: readonly TokenOption[],
): UtilityOverride[] {
  const groups = new Map<string, { context: StyleContext; names: string[]; cores: string[] }>();
  for (const name of classes) {
    const { variants, base } = splitUtility(name);
    const context = variants.length === 0 ? null : contextOfVariants(variants);
    if (context === null) continue;
    const key = `${context.width ?? ''}|${context.state ?? ''}`;
    const group = groups.get(key) ?? { context, names: [], cores: [] };
    groups.set(key, group);
    group.names.push(name);
    group.cores.push(coreOf(base));
  }
  const found: UtilityOverride[] = [];
  for (const { context, names, cores } of groups.values()) {
    for (const property of STYLE_PROPERTIES) {
      const at = utilityAmong(property, cores);
      const utility = names[at];
      const core = cores[at];
      if (utility === undefined || core === undefined) continue;
      found.push({ context, property, ...shownValueOf(property, core, tokens), utility });
    }
  }
  return found;
}
