// A kit's tokens as the kit page shows them: colours with their contrast, spacing and radius as a
// drawn scale, type sizes as sample lines. Pure: the page renders what these return, and the rules
// that size a bar, a corner or a sample go into the page's own `<style nonce>` block (the page
// policy forbids `style=""` attributes).

import { cssVarName, type FlatToken, formatTokenValue } from '../../kit/index.ts';
import { contrastRatio } from '../theme/contrast.ts';

export type ContrastLine = { white: string; black: string };
export type ColorRow = { name: string; value: string; contrast: ContrastLine | null };
export type ValueRow = { name: string; value: string };

export type KitTokens = {
  colors: ColorRow[];
  spacing: ValueRow[];
  radius: ValueRow[];
  /** Font sizes, shown as sample lines. */
  sizes: ValueRow[];
  families: ValueRow[];
  weights: ValueRow[];
  /** Everything else: line heights, durations, the sizes of controls. */
  other: ValueRow[];
};

/** `4.5:1`, never rounded up: 4.46 is not a pass. */
const ratioText = (ratio: number): string => `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;

/**
 * The contrast of a colour on white and on black; `null` for a value that is no hex colour (a
 * colour with an alpha is written as `rgb(… / …)`, and has no single contrast).
 */
export function contrastLine(value: string): ContrastLine | null {
  const white = contrastRatio(value, '#ffffff');
  const black = contrastRatio(value, '#000000');
  if (white === null || black === null) return null;
  return { white: ratioText(white), black: ratioText(black) };
}

export function splitTokens(tokens: FlatToken[]): KitTokens {
  const split: KitTokens = {
    colors: [],
    spacing: [],
    radius: [],
    sizes: [],
    families: [],
    weights: [],
    other: [],
  };
  for (const token of tokens) {
    const name = cssVarName(token.path);
    const value = formatTokenValue(token);
    const row = { name, value };
    const dimensionOf = (prefix: string): boolean =>
      token.type === 'dimension' && name.startsWith(prefix);
    if (token.type === 'color') {
      split.colors.push({ ...row, contrast: contrastLine(value) });
    } else if (token.type === 'fontFamily') {
      split.families.push(row);
    } else if (token.type === 'fontWeight') {
      split.weights.push(row);
    } else if (dimensionOf('--kit-space-')) {
      split.spacing.push(row);
    } else if (dimensionOf('--kit-radius-')) {
      split.radius.push(row);
    } else if (dimensionOf('--kit-font-size-')) {
      split.sizes.push(row);
    } else {
      split.other.push(row);
    }
  }
  return split;
}

/** A token name that is safe inside an attribute selector. */
const SAFE_NAME = /^--[a-z0-9-]+$/;

/** A dimension as CSS, always with its unit (`0px`, never a bare `0`, which `min()` refuses). */
function dimension(token: FlatToken): string | null {
  return token.type === 'dimension' ? `${token.value.value}${token.value.unit}` : null;
}

/**
 * The size of each bar of the spacing scale and each corner of the radius scale, as the custom
 * property `--size` of its element; the skin draws it (`min(var(--size), 100%)`).
 */
export function scaleRules(tokens: FlatToken[]): string {
  const rules: string[] = [];
  for (const token of tokens) {
    const name = cssVarName(token.path);
    const size = dimension(token);
    if (size === null || !SAFE_NAME.test(name)) continue;
    if (name.startsWith('--kit-space-')) {
      rules.push(`.kit-bar[data-token="${name}"] { --size: ${size}; }`);
    }
    if (name.startsWith('--kit-radius-')) {
      rules.push(`.kit-corner[data-token="${name}"] { --size: ${size}; }`);
    }
  }
  return rules.join('\n');
}

/** A family name that cannot leave the CSS value it is written into. */
const SAFE_FAMILY = /^[A-Za-z0-9 _-]+$/;

/** The families of a token that are safe to write, quoted unless a plain word (a generic family). */
export function safeFamilies(value: string | string[]): string[] {
  return [value]
    .flat()
    .filter((name) => SAFE_FAMILY.test(name))
    .map((name) => (/^[A-Za-z-]+$/.test(name) ? name : `"${name}"`));
}

/**
 * Sample lines in the kit's own type: the family of its body font on the list, a size per size
 * token, a weight per weight token.
 */
export function typeRules(tokens: FlatToken[]): string {
  const rules: string[] = [];
  const families = tokens.filter((token) => token.type === 'fontFamily');
  const body = families.find((token) => cssVarName(token.path).endsWith('-body')) ?? families[0];
  if (body?.type === 'fontFamily') {
    const list = safeFamilies(body.value);
    if (list.length > 0) rules.push(`.kit-sample { font-family: ${list.join(', ')}; }`);
  }
  for (const token of tokens) {
    const name = cssVarName(token.path);
    if (!SAFE_NAME.test(name)) continue;
    const size = dimension(token);
    if (size !== null && name.startsWith('--kit-font-size-')) {
      rules.push(`.kit-sample[data-token="${name}"] { font-size: ${size}; }`);
    }
    if (token.type === 'fontWeight') {
      rules.push(`.kit-sample[data-token="${name}"] { font-weight: ${token.value}; }`);
    }
  }
  return rules.join('\n');
}
