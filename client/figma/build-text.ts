// The text of the hand-off's layers inside `use_figma` (plan 21), and what every layer shares while
// it is built: colours of the page as Figma's paints, and a binding that, when Figma refuses it or
// the file lacks the variable, leaves the value as it is and is counted. A draft's text arrives as
// data and is only ever assigned to `characters`.

import type { FigmaApi, SolidPaint, TextNode, Variable, VariableValue } from './api.ts';
import { type Fonts, readStyle } from './fonts.ts';

/** A colour as the page painted it: `#rrggbb`, or `#rrggbbaa` when it is not opaque. */
export type Hex = string;

/** start, end, weight, italic, underline, colour: an inline part that differs from its block. */
export type PackedRun = [number, number, number, 0 | 1, 0 | 1, Hex];

/** A text block. Absent fields keep Figma's default. */
export type PackedText = {
  /** The characters, as painted. */
  c: string;
  /** The family the page asked for; Inter when Figma lacks it. */
  f: string;
  /** CSS weight. */
  w: number;
  i?: 1;
  /** Size, px. */
  z: number;
  /** Line height, px; absent: Figma's auto. */
  h?: number;
  /** Letter spacing, px; absent: none. */
  s?: number;
  /** Absent: left. */
  a?: 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  /** Absent: as written. */
  x?: 'UPPER' | 'LOWER' | 'TITLE';
  /** Colour. */
  o: Hex;
  r?: PackedRun[];
  /** Wraps at the box's width and grows in height; absent: one line that hugs. */
  m?: 1;
};

/** What every layer of one script shares while it is built. */
export type Scope = {
  figma: FigmaApi;
  fonts: Fonts;
  /** The script's variables by index; null for one the file lacks. */
  vars: readonly (Variable | null)[];
  /** The default mode of the kit's collection. */
  mode: string;
  /** Values left as they are: a binding Figma refused or with no variable, an SVG it could not read. */
  refused: number;
};

const unit = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 1e4) / 1e4;

/** A colour of the page as Figma's channels from 0 to 1, and its alpha. */
export function rgba(hex: Hex): { r: number; g: number; b: number; a: number } {
  const digits = hex.replace('#', '');
  const channel = (at: number): number => {
    const value = Number.parseInt(digits.slice(at, at + 2), 16);
    return Number.isNaN(value) ? 0 : unit(value / 255);
  };
  return { r: channel(0), g: channel(2), b: channel(4), a: digits.length >= 8 ? channel(6) : 1 };
}

/** A solid paint: the alpha goes in the paint's opacity, never in its colour. */
export function solid(hex: Hex): SolidPaint {
  const { r, g, b, a } = rgba(hex);
  const color = { r, g, b };
  return a < 1 ? { type: 'SOLID', color, opacity: a } : { type: 'SOLID', color };
}

/** Variable `index` of the scope, or null (counted) when the file lacks it. */
function variableAt(scope: Scope, index: number): Variable | null {
  const variable = scope.vars[index] ?? null;
  if (variable === null) scope.refused += 1;
  return variable;
}

/** Runs `apply` with variable `index`; a missing variable or a refusal is counted, not thrown. */
export function attempt(
  scope: Scope,
  index: number | undefined,
  apply: (variable: Variable) => void,
): void {
  if (index === undefined) return;
  const variable = variableAt(scope, index);
  if (variable === null) return;
  try {
    apply(variable);
  } catch (_refused) {
    scope.refused += 1;
  }
}

/** The value of variable `index` in the kit's default mode. */
export function variableValue(scope: Scope, index: number | undefined): VariableValue | undefined {
  if (index === undefined) return undefined;
  return scope.vars[index]?.valuesByMode[scope.mode];
}

/**
 * A solid paint of the colour, bound to variable `index` when there is one. The variable holds
 * the alpha, so a bound paint has no opacity of its own; the paint Figma returns is the one used.
 */
export function boundSolid(scope: Scope, hex: Hex, index: number | undefined): SolidPaint {
  let paint = solid(hex);
  attempt(scope, index, (variable) => {
    const opaque: SolidPaint = { type: 'SOLID', color: paint.color };
    paint = scope.figma.variables.setBoundVariableForPaint(opaque, 'color', variable);
  });
  return paint;
}

/** Text bindings by their key in a layer's `x`. */
export type TextBound = { t?: number; z?: number; w?: number; y?: number };

/**
 * Writes a text block into a TEXT node already in its parent: the font first, then the
 * characters, the typography, the colour and the runs. Each font was loaded by the script before.
 * The family and the weight are bound only when Figma sets the text in that very font, and never
 * over runs of their own.
 */
export function writeText(scope: Scope, node: TextNode, text: PackedText, bound: TextBound): void {
  const font = scope.fonts.font(text.f, text.w, text.i === 1);
  node.fontName = font;
  node.characters = text.c;
  node.fontSize = Math.max(1, text.z);
  if (text.h !== undefined && text.h > 0) node.lineHeight = { unit: 'PIXELS', value: text.h };
  if (text.s !== undefined) node.letterSpacing = { unit: 'PIXELS', value: text.s };
  if (text.a !== undefined) node.textAlignHorizontal = text.a;
  if (text.x !== undefined) node.textCase = text.x;
  node.fills = [boundSolid(scope, text.o, bound.t)];
  for (const [start, end, weight, italic, underline, colour] of text.r ?? []) {
    if (start < 0 || start >= end || end > text.c.length) continue;
    const own = scope.fonts.font(text.f, weight, italic === 1);
    if (own.family !== font.family || own.style !== font.style) {
      node.setRangeFontName(start, end, own);
    }
    if (colour !== text.o) node.setRangeFills(start, end, [solid(colour)]);
    if (underline === 1) node.setRangeTextDecoration(start, end, 'UNDERLINE');
  }
  attempt(scope, bound.z, (variable) => node.setBoundVariable('fontSize', variable));
  const exact = scope.fonts.has(text.f) && text.r === undefined;
  if (bound.y !== undefined) {
    if (exact && variableValue(scope, bound.y) === font.family) {
      attempt(scope, bound.y, (variable) => node.setBoundVariable('fontFamily', variable));
    } else scope.refused += 1;
  }
  if (bound.w !== undefined) {
    const weight = readStyle(font.style)?.weight;
    if (exact && weight === text.w && variableValue(scope, bound.w) === text.w) {
      attempt(scope, bound.w, (variable) => node.setBoundVariable('fontWeight', variable));
    } else scope.refused += 1;
  }
}

/** A text that wraps: a fixed width, its height grows with its lines. */
export function wrapText(node: TextNode, width: number, height: number): void {
  node.textAutoResize = 'HEIGHT';
  node.resize(Math.max(1, width), Math.max(1, height));
}
