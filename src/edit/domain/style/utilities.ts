// The utility classes of a Tailwind draft under a width or a state (spec 4c, goal 2): `md:p-6`,
// `hover:bg-primary`, `md:hover:p-6`. A class without a variant is the base and is read by
// `source.ts`; here are the variants kitvas writes, the override each prefixed class is, and
// whether a class is one kitvas knows. Every class is read and written as the project's own
// Tailwind takes it (plan 29): its major, its prefix and its screens, as the version's build
// reported them (`TailwindTheme`). The studio builds the classes from these tables
// (`client/studio/edit/style/utility-ops.ts`), so this file stays package-free (ADR 0080).

import type { TailwindTheme } from '../../../shared/values/tailwind-file.ts';
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
import { themeName } from './theme-keys.ts';
import { coreOf, joinUtility, splitUtility } from './utility-class.ts';

export { themeKeyOf, themeName } from './theme-keys.ts';
export { coreOf, splitUtility } from './utility-class.ts';

/** Tailwind's own screens, by their min width in px: only for a build that reported no theme. */
export const DEFAULT_SCREENS: Readonly<Record<string, number>> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

/**
 * The theme a version's classes are read and written by, Tailwind 4 with no prefix and Tailwind's
 * own screens when its build reported none: every draft built before kitvas read the project's
 * Tailwind was a Tailwind 4 one. A theme with no screens (a Tailwind 4 that could not say them)
 * has Tailwind's own.
 */
export function themeOrDefault(theme: TailwindTheme | null | undefined): TailwindTheme {
  if (theme === null || theme === undefined) {
    return { version: 4, prefix: '', screens: { ...DEFAULT_SCREENS }, aliases: {} };
  }
  const screens = Object.keys(theme.screens).length > 0 ? theme.screens : { ...DEFAULT_SCREENS };
  return screens === theme.screens ? theme : { ...theme, screens };
}

/** The class each keyword of a keyword property is written as, in Tailwind 4. */
const KEYWORD_UTILITY: Record<KeywordProperty, Readonly<Record<string, string>>> = {
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
 * Where Tailwind 3 says a keyword otherwise: a solid outline is `outline`, and it has no class for
 * none (its `outline-none` is a transparent line), so none is the property itself.
 */
const KEYWORD_UTILITY_3: Partial<Record<KeywordProperty, Readonly<Record<string, string>>>> = {
  'outline-style': {
    none: '[outline-style:none]',
    solid: 'outline',
    dashed: 'outline-dashed',
    dotted: 'outline-dotted',
  },
};

/** The class of each keyword of a keyword property in that Tailwind. */
export function keywordClasses(
  property: KeywordProperty,
  version: 3 | 4,
): Readonly<Record<string, string>> {
  return (version === 3 ? KEYWORD_UTILITY_3[property] : undefined) ?? KEYWORD_UTILITY[property];
}

/** The class a keyword is written as in that Tailwind; `undefined` for a word outside the list. */
export function keywordUtility(
  property: KeywordProperty,
  value: string,
  version: 3 | 4,
): string | undefined {
  const classes = keywordClasses(property, version);
  return Object.hasOwn(classes, value) ? classes[value] : undefined;
}

/** A project's screens by name, each its min width in px (`TailwindTheme.screens`). */
type Screens = Readonly<Record<string, number>>;

/** The min width a screen variant stands for: a screen of the project, or `min-[900px]`. */
function screenWidth(variant: string, screens: Screens): number | null {
  if (Object.hasOwn(screens, variant)) return screens[variant] ?? null;
  const width = Number(/^min-\[([1-9]\d{0,4})px\]$/.exec(variant)?.[1] ?? Number.NaN);
  return Number.isInteger(width) && width <= MAX_BREAKPOINT ? width : null;
}

/** The screen variant of a width: the project's name for it (`md`), else `min-[900px]`. */
export function screenOf(width: number, screens: Screens): string {
  const named = Object.keys(screens).find((name) => screens[name] === width);
  return named ?? `min-[${width}px]`;
}

/**
 * The context a class's variants stand for: at most one screen and one state, in any order.
 * `null` for any other variant (`dark`, `group-hover`, two screens): kitvas does not write those.
 */
export function contextOfVariants(
  variants: readonly string[],
  screens: Screens,
): StyleContext | null {
  let width: number | null = null;
  let state: StyleState | null = null;
  for (const variant of variants) {
    const screen = screenWidth(variant, screens);
    const named: StyleState | undefined = STYLE_STATES.find((name) => name === variant);
    if (screen !== null && width === null) width = screen;
    else if (named !== undefined && state === null) state = named;
    else return null;
  }
  // A Tailwind draft's options act through the prop only (plan 25): no utility names one.
  return { width, state, option: null };
}

/** The prefixes of a context, the screen first: `md:hover:`; none for the base. */
export function variantPrefix(context: StyleContext, screens: Screens): string {
  const screen = context.width === null ? '' : `${screenOf(context.width, screens)}:`;
  return context.state === null ? screen : `${screen}${context.state}:`;
}

/**
 * The class of a utility (`p-6`, `!-mt-2`) in a context, with the project's prefix where its
 * Tailwind writes it: `md:hover:tw-p-6` in Tailwind 3, `tw:md:hover:p-6` in Tailwind 4.
 */
export const utilityIn = (base: string, context: StyleContext, tailwind: TailwindTheme): string =>
  joinUtility(variantPrefix(context, tailwind.screens), base, tailwind);

/**
 * The prefixes that are the property's own utility: `p-` for `padding`, not the `px-` that sets a
 * part of it; every class of a keyword property; a whole class such as `border`.
 */
export function ownPrefixes(property: StyleProperty): string[] {
  return UTILITY_PREFIXES[property].filter(
    (prefix, at) => at === 0 || !prefix.endsWith('-') || isKeywordProperty(property),
  );
}

/**
 * The properties a utility (its variants and the project's prefix taken off) is the own utility
 * of in that Tailwind: `p-4` is `padding`'s; `outline` is `outline-width`'s in Tailwind 4 only.
 */
export function ownProperties(base: string, version: 3 | 4): StyleProperty[] {
  const core = coreOf(base);
  return STYLE_PROPERTIES.filter((property) =>
    ownPrefixes(property).some((prefix) => utilityMatches(property, prefix, core, version)),
  );
}

/**
 * A class kitvas may write: it carries the project's prefix, it sets a property of the editor's
 * set, and its variants are a screen of the project, a state or both.
 */
export function knownUtility(className: string, tailwind: TailwindTheme): boolean {
  const split = splitUtility(className, tailwind);
  if (split === null || contextOfVariants(split.variants, tailwind.screens) === null) return false;
  const core = coreOf(split.base);
  return STYLE_PROPERTIES.some((property) =>
    UTILITY_PREFIXES[property].some((prefix) =>
      utilityMatches(property, prefix, core, tailwind.version),
    ),
  );
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

/** The kit token of the property's type whose theme key the utility's value names. */
function namedToken(
  property: StyleProperty,
  name: string,
  tokens: readonly TokenOption[],
  version: 3 | 4,
): TokenOption | undefined {
  const type = tokenTypeOf(property);
  return tokens.find((each) => each.type === type && themeName(property, each, version) === name);
}

/** What the utility `core` holds for `property`, once it is known to set it. */
function shownValueOf(
  property: StyleProperty,
  core: string,
  tokens: readonly TokenOption[],
  version: 3 | 4,
): { value: string; offKit: boolean } {
  if (isKeywordProperty(property)) {
    const words = keywordClasses(property, version);
    const keyword = Object.keys(words).find((word) => words[word] === core);
    return { value: keyword ?? core, offKit: false };
  }
  const prefix = UTILITY_PREFIXES[property].find((each) =>
    utilityMatches(property, each, core, version),
  );
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
  const token = namedToken(property, rest, tokens, version);
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
  tailwind: TailwindTheme,
): UtilityOverride[] {
  const groups = new Map<string, { context: StyleContext; names: string[]; cores: string[] }>();
  for (const name of classes) {
    const split = splitUtility(name, tailwind);
    if (split === null || split.variants.length === 0) continue;
    const context = contextOfVariants(split.variants, tailwind.screens);
    if (context === null) continue;
    const key = `${context.width ?? ''}|${context.state ?? ''}`;
    const group = groups.get(key) ?? { context, names: [], cores: [] };
    groups.set(key, group);
    group.names.push(name);
    group.cores.push(coreOf(split.base));
  }
  const found: UtilityOverride[] = [];
  for (const { context, names, cores } of groups.values()) {
    for (const property of STYLE_PROPERTIES) {
      const at = utilityAmong(property, cores, tailwind.version);
      const utility = names[at];
      const core = cores[at];
      if (utility === undefined || core === undefined) continue;
      const shown = shownValueOf(property, core, tokens, tailwind.version);
      found.push({ context, property, ...shown, utility });
    }
  }
  return found;
}
