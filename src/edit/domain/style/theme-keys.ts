// The theme keys a kit's tokens map onto (`css-var-map.json`), as the project's Tailwind names
// them in a class (plan 29). A token is a named class (`bg-primary`, `rounded-md`, `p-4`) only
// through the key its map value names, and only for a property whose utility reads that key's
// namespace; any other token is written as `[var(--kit-…)]`. Package-free (ADR 0080).

import { themePathOf } from '../../../shared/values/theme-path.ts';
import type { StyleProperty, TokenOption } from '../types.ts';

/** A theme key as a utility names it: `{ namespace: 'color', name: 'primary' }` is `bg-primary`. */
export type ThemeKey = NonNullable<TokenOption['utility']>;

type Namespaces = Partial<Record<StyleProperty, readonly string[]>>;

const PADDINGS: readonly StyleProperty[] = [
  'padding',
  'padding-block',
  'padding-inline',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
];
const MARGINS: readonly StyleProperty[] = [
  'margin',
  'margin-block',
  'margin-inline',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
];
const SIZES: readonly StyleProperty[] = ['gap', 'width', 'height', 'min-width', 'min-height'];
const COLOURS: readonly StyleProperty[] = [
  'color',
  'background-color',
  'border-color',
  'outline-color',
];

function table(rows: readonly [readonly StyleProperty[], readonly string[]][]): Namespaces {
  const namespaces: Namespaces = {};
  for (const [properties, names] of rows) {
    for (const property of properties) namespaces[property] = names;
  }
  return namespaces;
}

/**
 * The namespaces whose keys each property's utility reads, by Tailwind's major: Tailwind 4's theme
 * variables (`--spacing-md` for `p-md`, `--color-primary` for `bg-primary`), Tailwind 3's theme
 * keys (`spacing.4` and `padding.4` for `p-4`, `colors.primary` and `backgroundColor.primary`
 * for `bg-primary`).
 */
const NAMESPACES: Record<3 | 4, Namespaces> = {
  4: table([
    [[...PADDINGS, ...MARGINS, ...SIZES], ['spacing']],
    [COLOURS, ['color']],
    [['border-radius'], ['radius']],
    [['font-size'], ['text']],
    [['font-weight'], ['font-weight']],
    [['line-height'], ['leading']],
  ]),
  3: table([
    [PADDINGS, ['padding', 'spacing']],
    [MARGINS, ['margin', 'spacing']],
    [['gap'], ['gap', 'spacing']],
    [['width'], ['width', 'spacing']],
    [['height'], ['height', 'spacing']],
    [['min-width'], ['minWidth']],
    [['min-height'], ['minHeight']],
    [['color'], ['colors', 'textColor']],
    [['background-color'], ['colors', 'backgroundColor']],
    [['border-color'], ['colors', 'borderColor']],
    [['outline-color'], ['colors', 'outlineColor']],
    [['border-radius'], ['borderRadius']],
    [['font-size'], ['fontSize']],
    [['font-weight'], ['fontWeight']],
    [['line-height'], ['lineHeight']],
    [['border-width'], ['borderWidth']],
    [['outline-width'], ['outlineWidth']],
  ]),
};

/** Tailwind 4's namespaces a theme variable may start with: `--font-weight-bold`. */
const VARIABLE_NAMESPACES = ['font-weight', 'spacing', 'leading', 'radius', 'color', 'text'];
/** A key's name in a variable: words joined by single `-` (`--text-sm--line-height` is a sub-key). */
const VARIABLE_NAME = /^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*$/;

/** A Tailwind 3 namespace of colours, whose nested keys join with `-` (`primary-foreground`). */
const colours = (namespace: string): boolean =>
  namespace === 'colors' || namespace.endsWith('Color');

/**
 * The theme key a map value names: a Tailwind 4 theme variable (`--radius-md` is `radius`/`md`)
 * or a Tailwind 3 theme path (`theme(spacing.4)` is `spacing`/`4`, `DEFAULT` the key's own
 * class: `theme(colors.primary.DEFAULT)` is `colors`/`primary`). `undefined` for a value that
 * names none a class could say: a variable of the project's own (`--primary`; `tokenOptions`
 * first reads it through the theme's `aliases`), or a key with no name of its own
 * (`theme(borderRadius.DEFAULT)`).
 */
export function themeKeyOf(value: string): ThemeKey | undefined {
  const path = themePathOf(value);
  if (path !== undefined) {
    const [namespace = '', ...rest] = path.split('.');
    const parts = rest.filter((part) => part !== 'DEFAULT');
    if (parts.length === 0 || (parts.length > 1 && !colours(namespace))) return undefined;
    return { namespace, name: parts.join('-') };
  }
  const namespace = VARIABLE_NAMESPACES.find((each) => value.startsWith(`--${each}-`));
  const name = namespace === undefined ? '' : value.slice(namespace.length + 3);
  return namespace !== undefined && VARIABLE_NAME.test(name) ? { namespace, name } : undefined;
}

/**
 * The name a token has in the property's utility of that Tailwind (`md` in `rounded-md`): its
 * theme key's, when the property reads the key's namespace; `null` otherwise.
 */
export function themeName(
  property: StyleProperty,
  token: Pick<TokenOption, 'utility'>,
  version: 3 | 4,
): string | null {
  const key = token.utility;
  if (key === undefined) return null;
  return NAMESPACES[version][property]?.includes(key.namespace) === true ? key.name : null;
}
