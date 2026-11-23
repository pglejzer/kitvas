// Where a style property's value comes from, so that an edit goes to that place (spec 4a,
// decision 9, ADR 0050): a kit prop that sets it, the element's class rule in the section SCSS, a
// utility class in a Tailwind draft, or else the kit's own default. A wrong answer writes the
// wrong layer: an SCSS override on top of a kit prop that sets the same thing, or a prop change
// for a property the prop does not set. So the prop match asks for a name from the table and,
// for a name that is only a hint (`p`, `size`), values that are a token scale of the property.

import {
  type Declaration,
  PROPERTY_TOKEN_TYPE,
  type RuleView,
  type StyleProperty,
  type StyleSource,
  type TokenOption,
} from './types.ts';

export type SourceInput = {
  property: StyleProperty;
  /**
   * The kit component's catalog props; `null` for a plain element, and for a part such as
   * `Card.Header`: the catalog's props belong to the root component, not to its parts.
   */
  component: {
    props: readonly { name: string; type: string; values?: readonly string[] | undefined }[];
  } | null;
  /** The props written on the tag. */
  written: readonly string[];
  /** The rule `.styleClass` in the section SCSS, if any. */
  rule: RuleView | null;
  /** The element's classes in a string `className`. */
  classes: readonly string[];
  format: 'scss' | 'tailwind';
  /**
   * The kit's token groups by type, for the value match: `{ dimension: { space: ['none','xs'] } }`.
   * A group is a token's path without its last part (`space` for `space.md`, `color.brand` for
   * `color.brand.500`), and it lists those last parts. `tokenGroupsOf` builds it.
   */
  tokenGroups: Partial<Record<TokenOption['type'], Record<string, readonly string[]>>>;
};

/**
 * The catalog prop names that may set each property, the property's own name (camel case) first.
 * A prop named exactly like the property sets it whatever its values (spec decision 9: "a prop
 * named like the property"); every other name is only a hint and needs values that name tokens.
 */
export const PROP_FOR: Record<StyleProperty, readonly string[]> = {
  padding: ['padding', 'p'],
  'padding-block': ['paddingBlock', 'py'],
  'padding-inline': ['paddingInline', 'px'],
  margin: ['margin', 'm'],
  'margin-block': ['marginBlock', 'my'],
  'margin-inline': ['marginInline', 'mx'],
  gap: ['gap', 'spacing'],
  color: ['color', 'tone'],
  'background-color': ['backgroundColor', 'bg', 'background'],
  'border-color': ['borderColor'],
  'font-size': ['fontSize', 'size'],
  'font-weight': ['fontWeight', 'weight'],
  'line-height': ['lineHeight', 'leading'],
  'border-radius': ['borderRadius', 'radius', 'rounded'],
  'border-width': ['borderWidth'],
  width: ['width', 'w'],
  height: ['height', 'h'],
};

/**
 * The Tailwind utility prefixes that set each property, the one that wins first (Tailwind writes
 * `py-` after `p-` in its sheet). An entry without the trailing `-` is a whole class: `border` is
 * a 1px border, `rounded` a small radius. Variants such as `md:` are stripped before matching.
 */
export const UTILITY_PREFIXES: Record<StyleProperty, readonly string[]> = {
  padding: ['p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-', 'ps-', 'pe-'],
  'padding-block': ['py-', 'pt-', 'pb-', 'p-'],
  'padding-inline': ['px-', 'ps-', 'pe-', 'pl-', 'pr-', 'p-'],
  margin: ['m-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-', 'ms-', 'me-'],
  'margin-block': ['my-', 'mt-', 'mb-', 'm-'],
  'margin-inline': ['mx-', 'ms-', 'me-', 'ml-', 'mr-', 'm-'],
  gap: ['gap-'],
  color: ['text-'],
  'background-color': ['bg-'],
  'border-color': ['border-'],
  'font-size': ['text-'],
  'font-weight': ['font-'],
  'line-height': ['leading-'],
  'border-radius': ['rounded-', 'rounded'],
  'border-width': ['border-', 'border'],
  width: ['w-', 'size-'],
  height: ['h-', 'size-'],
};

/** Where the value of `input.property` comes from, in the order of spec decision 9. */
export function styleSource(input: SourceInput): StyleSource {
  const prop = propFor(input);
  if (prop !== null) return { kind: 'prop', prop };
  const { rule } = input;
  const declaration = rule === null ? undefined : declarationOf(rule, input.property);
  if (rule !== null && declaration !== undefined) {
    return {
      kind: 'scss',
      className: rule.className,
      value: declaration.value,
      offKit: declaration.offKit,
    };
  }
  if (input.format === 'tailwind') {
    const className = utilityFor(input.property, input.classes);
    if (className !== null) return { kind: 'utility', className };
  }
  return { kind: 'kit' };
}

/** Groups the kit's tokens for `SourceInput.tokenGroups`: `space.md` is `md` of `space`. */
export function tokenGroupsOf(
  tokens: readonly Pick<TokenOption, 'path' | 'type'>[],
): SourceInput['tokenGroups'] {
  const byType = new Map<TokenOption['type'], Map<string, string[]>>();
  for (const token of tokens) {
    const cut = token.path.lastIndexOf('.');
    // A token outside every group is no scale a prop's values could name.
    if (cut <= 0) continue;
    const byGroup = byType.get(token.type) ?? new Map<string, string[]>();
    byType.set(token.type, byGroup);
    const group = token.path.slice(0, cut);
    byGroup.set(group, [...(byGroup.get(group) ?? []), token.path.slice(cut + 1)]);
  }
  const groups: SourceInput['tokenGroups'] = {};
  // fromEntries defines own properties, so a group such as "__proto__" stays a plain key.
  for (const [type, byGroup] of byType) groups[type] = Object.fromEntries(byGroup);
  return groups;
}

// Step 1: the prop.

const camel = (property: string): string =>
  property.replace(/-([a-z])/g, (_match: string, letter: string) => letter.toUpperCase());

/** Token names compare without case and separators: the value `ink-mid` names `color.inkMid`. */
const normal = (name: string): string => name.toLowerCase().replace(/[-_\s]/g, '');

/**
 * Every value names a token of one group. `none` is left aside: kits list it beside a scale that
 * has no token for it. A scale needs one real token name, so `['none']` alone is no scale.
 */
function onScale(values: readonly string[], scales: readonly (readonly string[])[]): boolean {
  const wanted = values.map(normal).filter((value) => value !== 'none');
  if (wanted.length === 0) return false;
  return scales.some((names) => {
    const known = new Set(names.map(normal));
    return wanted.every((value) => known.has(value));
  });
}

/**
 * The catalog prop that sets the property, or `null`. Only an enum counts: its values are what
 * the panel offers, and a free value (a number or a string) cannot take a kit token. Whether the
 * tag writes it does not matter, since the prop is the place; it only breaks a tie between two.
 */
function propFor(input: SourceInput): string | null {
  const { property, component, written } = input;
  if (component === null) return null;
  const names = PROP_FOR[property];
  const own = camel(property);
  const scales = Object.values(input.tokenGroups[PROPERTY_TOKEN_TYPE[property]] ?? {});
  let best: { name: string; rank: number } | null = null;
  for (const prop of component.props) {
    const index = names.indexOf(prop.name);
    const values = prop.values ?? [];
    if (index < 0 || prop.type !== 'enum' || values.length === 0) continue;
    // Tones are colour names in the kit's own words (`muted`, `danger`), never token names.
    const named = prop.name === own || property === 'color';
    if (!named && !onScale(values, scales)) continue;
    // The prop the tag writes is the one in use; then the table's order, own name first.
    const rank = (written.includes(prop.name) ? 0 : names.length) + index;
    if (best === null || rank < best.rank) best = { name: prop.name, rank };
  }
  return best?.name ?? null;
}

// Step 2: the class rule.

/**
 * The declaration of the property in the rule's own body: the last one, which the browser
 * applies (two of them make a write `ambiguous`). One only in a nested block or a media query is
 * in `rule.nested`, never here.
 */
function declarationOf(rule: RuleView, property: StyleProperty): Declaration | undefined {
  return rule.declarations
    .filter((declaration) => declaration.property.trim().toLowerCase() === property)
    .at(-1);
}

// Step 3: the utility class.

/** What a utility's value holds, where one prefix serves two meanings (`text-sm`, `text-ink`). */
type ValueKind = 'measure' | 'color' | 'other';

/** The kind each property wants from a prefix it shares with another meaning. */
const SHARED_KIND: Partial<Record<StyleProperty, ValueKind>> = {
  color: 'color',
  'font-size': 'measure',
  'font-weight': 'measure',
  'border-color': 'color',
  'border-width': 'measure',
  'background-color': 'color',
};

const words = (...lists: string[]): string[] => lists.flatMap((list) => list.split(' '));

/** A whole value: one of `whole`, or one of `prefixes` followed by `-` and more. */
const oneOf = (whole: readonly string[], prefixes: readonly string[]): RegExp =>
  new RegExp(`^(?:${[...whole, ...prefixes.map((prefix) => `${prefix}-.+`)].join('|')})$`);

const FONT_SIZE = /^(?:xs|sm|base|lg|xl|[2-9]xl)$/;
const FONT_WEIGHT = /^(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\d+)$/;
/** `text-` utilities that set neither the colour nor the size: alignment, wrapping, overflow. */
const TEXT_OTHER = oneOf(
  words('left center right justify start end', 'wrap nowrap balance pretty ellipsis clip shadow'),
  words('shadow opacity'),
);
/** `bg-` utilities of the image, its size, place, repeat and clip: not the colour. */
const BG_OTHER = oneOf(
  words(
    'fixed local scroll auto cover contain none',
    'repeat no-repeat center top bottom left right',
  ),
  words(
    'clip origin gradient linear radial conic blend position',
    'size repeat top bottom left right opacity',
  ),
);
/** The side of `border-t-2`, `border-x`: stripped before the value is read. */
const BORDER_SIDE = /^[xytrbles](?:-|$)/;
/** `border-` utilities of the line style and the table model: neither width nor colour. */
const BORDER_OTHER = oneOf(
  words('solid dashed dotted double hidden none collapse separate spacing'),
  words('spacing opacity'),
);
const MEASURE_HINTS = new Set([
  'length',
  'line-width',
  'number',
  'percentage',
  'absolute-size',
  'relative-size',
]);

/**
 * What an arbitrary value holds: `[13px]`, `[color:var(--x)]`, or Tailwind 4's `(--x)`; `null`
 * when the value is not arbitrary. `unsaid` is what Tailwind reads a bare variable as.
 */
function arbitraryKind(value: string, unsaid: ValueKind): ValueKind | null {
  const square = value.startsWith('[') && value.endsWith(']');
  const round = value.startsWith('(') && value.endsWith(')');
  if (!square && !round) return null;
  const inner = value.slice(1, -1);
  const hint = /^([a-z-]+):/.exec(inner)?.[1];
  if (hint !== undefined) {
    if (hint === 'color') return 'color';
    return MEASURE_HINTS.has(hint) ? 'measure' : 'other';
  }
  if (/^(?:#|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\()/.test(inner)) {
    return 'color';
  }
  if (/^(?:-?\.?\d|(?:calc|clamp|min|max)\()/.test(inner)) return 'measure';
  if (/^(?:url|image-set|(?:repeating-)?(?:linear|radial|conic)-gradient)\(/.test(inner)) {
    return 'other';
  }
  return unsaid;
}

/** The kind of value of a `text-`, `font-`, `bg-` or `border` utility, after its prefix. */
function valueKind(prefix: string, rest: string): ValueKind {
  // `text-sm/6` carries a line height and `bg-ink/50` an opacity after the slash.
  const value = rest.replace(/\/[^\])]*$/, '');
  if (prefix === 'font-') {
    return arbitraryKind(value, 'other') ?? (FONT_WEIGHT.test(value) ? 'measure' : 'other');
  }
  if (prefix === 'text-') {
    if (FONT_SIZE.test(value)) return 'measure';
    return arbitraryKind(value, 'color') ?? (TEXT_OTHER.test(value) ? 'other' : 'color');
  }
  if (prefix === 'bg-') {
    return arbitraryKind(value, 'color') ?? (BG_OTHER.test(value) ? 'other' : 'color');
  }
  // `border`, `border-t`, `border-2` and `border-x-[3px]` set the width; `border-ink` the colour.
  const part = value.replace(BORDER_SIDE, '');
  if (part === '' || /^\d+$/.test(part)) return 'measure';
  return arbitraryKind(part, 'color') ?? (BORDER_OTHER.test(part) ? 'other' : 'color');
}

function fits(property: StyleProperty, prefix: string, rest: string): boolean {
  const wanted = SHARED_KIND[property];
  return wanted === undefined || valueKind(prefix, rest) === wanted;
}

/** `prefix` ends in `-` for a utility with a value (`p-4`), or it is a whole class (`border`). */
function matches(property: StyleProperty, prefix: string, base: string): boolean {
  if (!prefix.endsWith('-')) return base === prefix && fits(property, prefix, '');
  return (
    base.length > prefix.length &&
    base.startsWith(prefix) &&
    fits(property, prefix, base.slice(prefix.length))
  );
}

/** `md:hover:p-6` is `p-6` under variants; a `:` inside `[…]` or `(…)` belongs to the value. */
function utilityOf(className: string): { base: string; variant: boolean } {
  let depth = 0;
  let cut = -1;
  for (let at = 0; at < className.length; at += 1) {
    const char = className.charAt(at);
    if (char === '[' || char === '(') depth += 1;
    else if ((char === ']' || char === ')') && depth > 0) depth -= 1;
    else if (char === ':' && depth === 0) cut = at;
  }
  // `!p-4` (Tailwind 3) and `p-4!` (Tailwind 4) are important; `-mt-2` is a negative margin.
  const base = className
    .slice(cut + 1)
    .replace(/^!/, '')
    .replace(/!$/, '')
    .replace(/^-/, '');
  return { base, variant: cut >= 0 };
}

/**
 * The class that sets the property. One without a variant sets it at every width and state, so it
 * goes first; then the prefixes in their order, then the classes in theirs.
 */
function utilityFor(property: StyleProperty, classes: readonly string[]): string | null {
  const read = classes.filter((name) => name !== '').map((name) => ({ name, ...utilityOf(name) }));
  for (const variant of [false, true]) {
    for (const prefix of UTILITY_PREFIXES[property]) {
      const hit = read.find(
        (one) => one.variant === variant && matches(property, prefix, one.base),
      );
      if (hit !== undefined) return hit.name;
    }
  }
  return null;
}
