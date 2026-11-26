// The kit's tokens as Figma variables (plan 21, goal A4): one collection per kit, one mode, a
// variable per colour, dimension, number, font family and font weight token, named by its path
// (`color/ink`) with its `--kit-*` name as the web code syntax. `variables.json` of the package.

import type { FlatToken } from '../../../kit/index.ts';
import { kitVarName } from './token-uses.ts';
import type { BoundProperty } from './tree.ts';

export type FigmaVariable = {
  name: string;
  type: 'COLOR' | 'FLOAT' | 'STRING';
  value: { r: number; g: number; b: number; a: number } | number | string;
  scopes: string[];
  /** `var(--kit-color-ink)`. */
  syntax: string;
};

const PX_PER_REM = 16;

/** The scope Figma gives each property a variable can be bound to. */
const SCOPE_OF: Record<BoundProperty, string> = {
  fill: 'ALL_FILLS',
  stroke: 'STROKE_COLOR',
  text: 'TEXT_FILL',
  gap: 'GAP',
  'cross-gap': 'GAP',
  'padding-top': 'GAP',
  'padding-right': 'GAP',
  'padding-bottom': 'GAP',
  'padding-left': 'GAP',
  radius: 'CORNER_RADIUS',
  'font-size': 'FONT_SIZE',
  'font-weight': 'FONT_WEIGHT',
  'font-family': 'FONT_FAMILY',
};

/** What a token nothing was bound to may be used for, by its type. */
const DEFAULT_SCOPES = {
  color: ['ALL_FILLS', 'STROKE_COLOR'],
  dimension: ['GAP', 'WIDTH_HEIGHT'],
} as const;

function scopesOf(token: FlatToken, properties: ReadonlySet<BoundProperty> | undefined): string[] {
  if (properties !== undefined && properties.size > 0) {
    const scopes = new Set([...properties].map((property) => SCOPE_OF[property]));
    // `ALL_FILLS` already holds the text fill.
    if (scopes.has('ALL_FILLS')) scopes.delete('TEXT_FILL');
    return [...scopes];
  }
  if (token.type === 'color') return [...DEFAULT_SCOPES.color];
  if (token.type === 'dimension') return [...DEFAULT_SCOPES.dimension];
  return [];
}

function variableOf(token: FlatToken): Pick<FigmaVariable, 'type' | 'value'> | undefined {
  switch (token.type) {
    case 'color': {
      const [r, g, b] = token.value.components;
      return { type: 'COLOR', value: { r, g, b, a: token.value.alpha ?? 1 } };
    }
    case 'dimension': {
      const { value, unit } = token.value;
      return { type: 'FLOAT', value: unit === 'rem' ? value * PX_PER_REM : value };
    }
    case 'number':
    case 'fontWeight':
      return { type: 'FLOAT', value: token.value };
    case 'fontFamily':
      return { type: 'STRING', value: [token.value].flat()[0] ?? '' };
    case 'duration':
      return undefined;
  }
}

/**
 * The kit's tokens as Figma variables: colours, dimensions (in px), numbers, font families and font
 * weights, each named by its path (`color/ink`) with its `--kit-*` name as the web code syntax.
 * Durations have no use in a layout and are left out. `bound` says, per variable name, the
 * properties the draft bound it to; they decide its scopes.
 */
export function figmaVariables(
  tokens: readonly FlatToken[],
  bound: ReadonlyMap<string, ReadonlySet<BoundProperty>>,
): FigmaVariable[] {
  const variables: FigmaVariable[] = [];
  for (const token of tokens) {
    const made = variableOf(token);
    if (made === undefined) continue;
    const name = token.path.join('/');
    variables.push({
      name,
      ...made,
      scopes: scopesOf(token, bound.get(name)),
      syntax: `var(${kitVarName(token.path)})`,
    });
  }
  return variables;
}
