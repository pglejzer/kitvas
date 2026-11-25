// The CSS shorthands the editor reads and writes a part of (ADR 0070): which properties each one
// holds, the value of each of them in a shorthand's value, and that value with one part set or
// taken out. A value splits only when every part of it is understood (`shorthand-parts.ts`); a
// value that does not split is never written into. Sides are named as a page read left to right
// and top to bottom has them: the inline start is the left. Pure: no file text.

import { type StyleProperty, tokenTypeOf } from '../types.ts';
import {
  FLEX_DIRECTIONS,
  FLEX_WRAPS,
  isBoxPart,
  isColor,
  isToken,
  isUrl,
  lineKind,
  type Part,
  partsOf,
  type VarKind,
} from './shorthand-parts.ts';

export type { VarKind } from './shorthand-parts.ts';

export const SHORTHANDS = [
  'padding',
  'margin',
  'padding-block',
  'padding-inline',
  'margin-block',
  'margin-inline',
  'border',
  'outline',
  'background',
  'flex-flow',
] as const;
export type Shorthand = (typeof SHORTHANDS)[number];

type Box = 'padding' | 'margin';
type Pair = 'padding-block' | 'padding-inline' | 'margin-block' | 'margin-inline';
type Named = Exclude<Shorthand, Box | Pair>;
type Sides = readonly [StyleProperty, StyleProperty, StyleProperty, StyleProperty];

/** The sides of a box in the order its shorthand lists them: top, right, bottom, left. */
const SIDES: Record<Box, Sides> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
};

/** Each pair's box, and the places of its two sides in `SIDES`, the start first. */
const PAIRS: Record<Pair, { box: Box; at: readonly [number, number] }> = {
  'padding-block': { box: 'padding', at: [0, 2] },
  'padding-inline': { box: 'padding', at: [3, 1] },
  'margin-block': { box: 'margin', at: [0, 2] },
  'margin-inline': { box: 'margin', at: [3, 1] },
};

const AXES: Record<Box, { block: Pair; inline: Pair }> = {
  padding: { block: 'padding-block', inline: 'padding-inline' },
  margin: { block: 'margin-block', inline: 'margin-inline' },
};

const LINES: Record<'border' | 'outline', Record<'width' | 'style' | 'color', StyleProperty>> = {
  border: { width: 'border-width', style: 'border-style', color: 'border-color' },
  outline: { width: 'outline-width', style: 'outline-style', color: 'outline-color' },
};

const isBox = (name: string): name is Box => Object.hasOwn(SIDES, name);
const isPair = (name: string): name is Pair => Object.hasOwn(PAIRS, name);

/** The two sides of a pair, the start first. */
function pairSides(pair: Pair): readonly [StyleProperty, StyleProperty] {
  const { box, at } = PAIRS[pair];
  return [SIDES[box][at[0]] ?? box, SIDES[box][at[1]] ?? box];
}

/** The parts a shorthand's value is made of: no part is made of another one of them. */
const LEAVES: Record<Shorthand, readonly StyleProperty[]> = {
  padding: SIDES.padding,
  margin: SIDES.margin,
  'padding-block': pairSides('padding-block'),
  'padding-inline': pairSides('padding-inline'),
  'margin-block': pairSides('margin-block'),
  'margin-inline': pairSides('margin-inline'),
  border: Object.values(LINES.border),
  outline: Object.values(LINES.outline),
  background: ['background-color', 'background-image'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
};

/** The properties each shorthand answers for: its parts, and for a box its two pairs as well. */
const HOLDS: Record<Shorthand, readonly StyleProperty[]> = {
  ...LEAVES,
  padding: ['padding-block', 'padding-inline', ...SIDES.padding],
  margin: ['margin-block', 'margin-inline', ...SIDES.margin],
};

/** The parts a shorthand's value is made of: no part is made of another one of them. */
export const leavesOf = (shorthand: Shorthand): readonly StyleProperty[] => LEAVES[shorthand];

/** The properties a shorthand answers for, a box's pairs before its sides. */
export const heldBy = (shorthand: Shorthand): readonly StyleProperty[] => HOLDS[shorthand];

export const isShorthand = (name: string): name is Shorthand => Object.hasOwn(HOLDS, name);

/** The narrow shorthands before the wide ones. */
const BY_WIDTH: readonly Shorthand[] = [
  'padding-block',
  'padding-inline',
  'margin-block',
  'margin-inline',
  'padding',
  'margin',
  'border',
  'outline',
  'background',
  'flex-flow',
];

/**
 * The shorthands that can hold a property, the widest last: `padding-top` is held by
 * `padding-block` and `padding`.
 */
export function shorthandsOf(property: StyleProperty): readonly Shorthand[] {
  return BY_WIDTH.filter((shorthand) => HOLDS[shorthand].includes(property));
}

/** A shorthand's value as read: four sides, a pair's two ends, or each named part in its place. */
type Read =
  | { kind: 'box'; box: Box; sides: [string, string, string, string] }
  | { kind: 'pair'; pair: Pair; ends: [string, string] }
  | { kind: 'named'; parts: Part[]; at: Map<StyleProperty, Part> };

/** The property a part of `border`, `outline`, `background` or `flex-flow` sets, if any. */
function propertyOf(shorthand: Named, part: string, kindOf: VarKind): StyleProperty | null {
  if (shorthand === 'border' || shorthand === 'outline') {
    const kind = lineKind(part, kindOf, shorthand === 'outline');
    return kind === null ? null : LINES[shorthand][kind];
  }
  if (shorthand === 'background') {
    if (isUrl(part)) return 'background-image';
    return isColor(part, kindOf) ? 'background-color' : null;
  }
  const word = part.toLowerCase();
  if (FLEX_DIRECTIONS.includes(word)) return 'flex-direction';
  return FLEX_WRAPS.includes(word) ? 'flex-wrap' : null;
}

function read(shorthand: Shorthand, value: string, kindOf: VarKind): Read | null {
  const parts = partsOf(value);
  if (parts === null) return null;
  if (isBox(shorthand) || isPair(shorthand)) {
    const texts = parts.map((part) => part.text);
    const [first, second] = texts;
    if (first === undefined || !texts.every(isBoxPart)) return null;
    if (isPair(shorthand)) {
      if (texts.length > 2) return null;
      return { kind: 'pair', pair: shorthand, ends: [first, second ?? first] };
    }
    if (texts.length > 4) return null;
    // One value is every side; two are top and bottom, then right and left; three leave the left
    // to the right's value.
    const right = second ?? first;
    const sides: [string, string, string, string] = [
      first,
      right,
      texts[2] ?? first,
      texts[3] ?? right,
    ];
    return { kind: 'box', box: shorthand, sides };
  }
  const at = new Map<StyleProperty, Part>();
  for (const part of parts) {
    const property = propertyOf(shorthand, part.text, kindOf);
    // A part that is nothing the shorthand takes, or a second width, style, colour or image.
    if (property === null || at.has(property)) return null;
    at.set(property, part);
  }
  return { kind: 'named', parts, at };
}

/** A pair as one declaration says it: one value when its two sides are equal. */
const joined = (start: string, end: string): string => (start === end ? start : `${start} ${end}`);

/** The value of each property a shorthand's value sets; `null` when the value does not split. */
export function splitShorthand(
  shorthand: Shorthand,
  value: string,
  kindOf: VarKind,
): Partial<Record<StyleProperty, string>> | null {
  const now = read(shorthand, value, kindOf);
  if (now === null) return null;
  const held: Partial<Record<StyleProperty, string>> = {};
  if (now.kind === 'named') {
    for (const [property, part] of now.at) held[property] = part.text;
    return held;
  }
  if (now.kind === 'pair') {
    const [start, end] = pairSides(now.pair);
    held[start] = now.ends[0];
    held[end] = now.ends[1];
    return held;
  }
  const [top, right, bottom, left] = now.sides;
  SIDES[now.box].forEach((side, index) => {
    held[side] = now.sides[index] ?? top;
  });
  held[AXES[now.box].block] = joined(top, bottom);
  held[AXES[now.box].inline] = joined(left, right);
  return held;
}

/** The fewest values that say the four sides. */
function shortest([top, right, bottom, left]: readonly [string, string, string, string]): string {
  if (left !== right) return `${top} ${right} ${bottom} ${left}`;
  if (bottom !== top) return `${top} ${right} ${bottom}`;
  return joined(top, right);
}

/** `part` as the sides of a box take it: one or two box values; `null` for anything else. */
function boxValues(part: string, most: 1 | 2): [string, string] | null {
  const texts = partsOf(part)?.map((one) => one.text) ?? [];
  const [first, second] = texts;
  if (first === undefined || texts.length > most || !texts.every(isBoxPart)) return null;
  return [first, second ?? first];
}

/** A box or a pair with one side, or one pair of sides, set. */
function boxWith(
  now: Exclude<Read, { kind: 'named' }>,
  property: StyleProperty,
  part: string,
): string | null {
  if (now.kind === 'pair') {
    const given = boxValues(part, 1);
    if (given === null) return null;
    const [start] = pairSides(now.pair);
    const ends: [string, string] =
      property === start ? [given[0], now.ends[1]] : [now.ends[0], given[0]];
    return joined(ends[0], ends[1]);
  }
  const sides: [string, string, string, string] = [...now.sides];
  const side = SIDES[now.box].indexOf(property);
  const given = boxValues(part, side >= 0 ? 1 : 2);
  if (given === null) return null;
  // A side takes the one value; a pair gives its start and its end.
  const places: readonly [number, number] =
    side >= 0 ? [side, side] : isPair(property) ? PAIRS[property].at : [-1, -1];
  if (places[0] < 0) return null;
  sides[places[0]] = given[0];
  sides[places[1]] = given[1];
  return shortest(sides);
}

/** `border`, `outline`, `background` or `flex-flow` with one part set, added or taken out. */
function namedWith(
  shorthand: Named,
  value: string,
  now: Extract<Read, { kind: 'named' }>,
  property: StyleProperty,
  part: string | null,
  kindOf: VarKind,
): string | null {
  const held = now.at.get(property);
  if (part === null) {
    if (held === undefined) return null;
    const index = now.parts.indexOf(held);
    const next = now.parts[index + 1];
    const previous = now.parts[index - 1];
    // The part goes with the space that set it apart from its neighbour.
    if (next !== undefined) return value.slice(0, held.start) + value.slice(next.start);
    if (previous !== undefined) return value.slice(0, previous.end) + value.slice(held.end);
    return '';
  }
  const given = partsOf(part);
  const one = given?.length === 1 ? given[0] : undefined;
  if (one === undefined || propertyOf(shorthand, one.text, kindOf) !== property) return null;
  if (held === undefined) return `${value.trimEnd()} ${one.text}`;
  return value.slice(0, held.start) + one.text + value.slice(held.end);
}

/**
 * The shorthand's value with one property set (`part: null` takes it out); `null` when CSS has no
 * such value or the value does not split. The other parts stay as written. A box or a pair comes
 * back as the fewest values that say it, and no side leaves one alone. The last part taken out
 * leaves the empty text: the declaration has nothing to say any more.
 */
export function withPart(
  shorthand: Shorthand,
  value: string,
  property: StyleProperty,
  part: string | null,
  kindOf: VarKind,
): string | null {
  if (!HOLDS[shorthand].includes(property)) return null;
  const now = read(shorthand, value, kindOf);
  if (now === null) return null;
  if (now.kind !== 'named') return part === null ? null : boxWith(now, property, part);
  return isBox(shorthand) || isPair(shorthand)
    ? null
    : namedWith(shorthand, value, now, property, part, kindOf);
}

/** The keywords a length takes: no raw value, as the panel writes `auto` without the marker. */
const WORDS: ReadonlySet<string> = new Set(['auto', 'thin', 'medium', 'thick']);

/**
 * A part is a raw value, the kind the off-kit marker is for: a value of a token property with a
 * piece that is neither a kit token nor a length keyword. A colour by name is raw, as a colour
 * typed into the panel is; a style or a direction keyword and an image are never off-kit.
 */
export function rawPart(property: StyleProperty, part: string): boolean {
  if (tokenTypeOf(property) === null) return false;
  const pieces = partsOf(part);
  if (pieces === null) return true;
  return pieces.some((piece) => !isToken(piece.text) && !WORDS.has(piece.text.toLowerCase()));
}

/**
 * Some part of the shorthand's value other than `property` (and the sides `property` is made of)
 * is a raw value: what keeps the off-kit marker after the declaration when `property` changes.
 */
export function rawBeside(
  shorthand: Shorthand,
  value: string,
  property: StyleProperty,
  kindOf: VarKind,
): boolean {
  const held = splitShorthand(shorthand, value, kindOf);
  if (held === null) return false;
  const own: readonly StyleProperty[] = isShorthand(property) ? LEAVES[property] : [property];
  return LEAVES[shorthand].some((leaf) => {
    const part = held[leaf];
    return !own.includes(leaf) && part !== undefined && rawPart(leaf, part);
  });
}
