// Which kit token a layer's value is (plan 21, goal A4). A value is bound only when exactly one token
// of the right type has it and the built CSS uses that token for this kind of property. More than
// one, or none: it goes to Figma as a raw value and is counted. A wrong binding would let a later
// edit of a variable change something it was never meant to.

import type { LayerNode } from '../../../checks/index.ts';
import type { FlatToken } from '../../../kit/index.ts';
import { kitVarName, type TokenKind, type TokenUses } from './token-uses.ts';
import type { BoundProperty, TreeLayer } from './tree.ts';

const PADDING: BoundProperty[] = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
const PX_PER_REM = 16;

const byte = (part: number): string =>
  Math.round(part * 255)
    .toString(16)
    .padStart(2, '0');

/** `#rrggbbaa`, lower case; a six-digit colour gets an opaque alpha. */
function colourKey(colour: string): string {
  const lower = colour.toLowerCase();
  return `paint|${lower.length === 7 ? `${lower}ff` : lower}`;
}

const lengthKey = (kind: TokenKind, px: number): string => `${kind}|${Math.round(px * 100) / 100}`;

/** The first family of a list, without quotes, lower case: `"Inter", sans-serif` is `inter`. */
function familyKey(family: string): string {
  const first = family.split(',')[0] ?? '';
  return `font-family|${first
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase()}`;
}

/** The keys one token can stand for: its value in each kind of property its type fits. */
function keysOf(token: FlatToken): string[] {
  switch (token.type) {
    case 'color': {
      const [red, green, blue] = token.value.components;
      return [colourKey(`#${byte(red)}${byte(green)}${byte(blue)}${byte(token.value.alpha ?? 1)}`)];
    }
    case 'dimension': {
      const px = token.value.unit === 'rem' ? token.value.value * PX_PER_REM : token.value.value;
      return [lengthKey('space', px), lengthKey('radius', px), lengthKey('font-size', px)];
    }
    case 'fontWeight':
      return [`font-weight|${token.value}`];
    case 'fontFamily':
      return [familyKey([token.value].flat()[0] ?? '')];
    default:
      return [];
  }
}

/** Index of the tokens by key, for one token list and one reading of the CSS. */
type Index = ReadonlyMap<string, readonly string[]>;
const indexes = new WeakMap<readonly FlatToken[], WeakMap<TokenUses, Index>>();

function indexOf(tokens: readonly FlatToken[], uses: TokenUses): Index {
  const known = indexes.get(tokens)?.get(uses);
  if (known !== undefined) return known;
  const index = new Map<string, string[]>();
  for (const token of tokens) {
    const kinds = uses.get(kitVarName(token.path));
    if (kinds === undefined) continue;
    for (const key of keysOf(token)) {
      const kind = key.slice(0, key.indexOf('|'));
      if (!(kinds as ReadonlySet<string>).has(kind)) continue;
      const names = index.get(key) ?? [];
      names.push(token.path.join('/'));
      index.set(key, names);
    }
  }
  const byUses = indexes.get(tokens) ?? new WeakMap<TokenUses, Index>();
  byUses.set(uses, index);
  indexes.set(tokens, byUses);
  return index;
}

/** The values of a layer a variable could stand for: the property and the key of its value. */
function wanted(node: LayerNode): [BoundProperty, string][] {
  const found: [BoundProperty, string][] = [];
  const [only] = node.paints;
  if (node.paints.length === 1 && only?.kind === 'solid') {
    found.push(['fill', colourKey(only.colour)]);
  }
  if (node.border) found.push(['stroke', colourKey(node.border.colour)]);
  if (node.text) {
    found.push(
      ['text', colourKey(node.text.colour)],
      ['font-size', lengthKey('font-size', node.text.size)],
      ['font-weight', `font-weight|${node.text.weight}`],
      ['font-family', familyKey(node.text.family)],
    );
  }
  const flow = node.flow;
  if (flow) {
    if (flow.direction !== 'none' && flow.gap > 0)
      found.push(['gap', lengthKey('space', flow.gap)]);
    if (flow.direction !== 'none' && flow.wrap && flow.crossGap > 0) {
      found.push(['cross-gap', lengthKey('space', flow.crossGap)]);
    }
    for (const [at, property] of PADDING.entries()) {
      const value = flow.padding[at] ?? 0;
      if (value > 0) found.push([property, lengthKey('space', value)]);
    }
  }
  const [first] = node.radius;
  if (first !== undefined && first > 0 && node.radius.every((corner) => corner === first)) {
    found.push(['radius', lengthKey('radius', first)]);
  }
  return found;
}

export function bindLayer(
  node: LayerNode,
  tokens: readonly FlatToken[],
  uses: TokenUses,
): TreeLayer['bound'] {
  const index = indexOf(tokens, uses);
  const bound: TreeLayer['bound'] = {};
  for (const [property, key] of wanted(node)) {
    const names = index.get(key);
    const [name] = names ?? [];
    if (names?.length === 1 && name !== undefined) bound[property] = name;
  }
  return bound;
}

/** How many painted values of a layer a variable could have stood for and none did. */
export function rawValues(node: LayerNode, bound: TreeLayer['bound']): number {
  return wanted(node).filter(([property]) => bound[property] === undefined).length;
}
