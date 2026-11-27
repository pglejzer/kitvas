// The data of the hand-off's scripts (plan 21, goal A5): a section's layers as the builder takes
// them (`client/figma/build-layer.ts`): short keys, defaults left out, colours as `#rrggbb`, boxes
// from the parent's top left, bound values as indexes into the script's variable names. A
// script's data is one JSON literal, so a draft's text reaches it only as a string. Pure.

import type {
  Justify,
  PackedBound,
  PackedLayer,
  PackedPaint,
  PackedShadow,
} from '../../../../../client/figma/build-layer.ts';
import type { Hex, PackedRun, PackedText } from '../../../../../client/figma/build-text.ts';
import type { VariableData } from '../../../../../client/figma/builder.ts';
import type { Box, Colour, LayerFlow, LayerPaint, LayerText } from '../../../../checks/index.ts';
import { BOUND, type BoundProperty, type TreeLayer, type TreeSection } from '../tree.ts';
import type { FigmaVariable } from '../variables.ts';

type Scope = VariableData['s'][number];
type Sides = [number, number, number, number];

/** The key each bound property has in a packed layer's `x`. */
const BOUND_KEY = {
  fill: 'f',
  stroke: 's',
  text: 't',
  gap: 'g',
  'cross-gap': 'c',
  'padding-top': 'pt',
  'padding-right': 'pr',
  'padding-bottom': 'pb',
  'padding-left': 'pl',
  radius: 'r',
  'font-size': 'z',
  'font-weight': 'w',
  'font-family': 'y',
} as const satisfies Record<BoundProperty, keyof PackedBound>;

/** Every scope Figma knows, so that a variable carries no name it would refuse. */
const SCOPES: Record<Scope, true> = {
  ALL_SCOPES: true,
  TEXT_CONTENT: true,
  CORNER_RADIUS: true,
  WIDTH_HEIGHT: true,
  GAP: true,
  ALL_FILLS: true,
  FRAME_FILL: true,
  SHAPE_FILL: true,
  TEXT_FILL: true,
  STROKE_COLOR: true,
  STROKE_FLOAT: true,
  EFFECT_FLOAT: true,
  EFFECT_COLOR: true,
  OPACITY: true,
  FONT_FAMILY: true,
  FONT_STYLE: true,
  FONT_WEIGHT: true,
  FONT_SIZE: true,
  LINE_HEIGHT: true,
  LETTER_SPACING: true,
  PARAGRAPH_SPACING: true,
  PARAGRAPH_INDENT: true,
};
const isScope = (scope: string): scope is Scope => Object.hasOwn(SCOPES, scope);

const JUSTIFY: Record<LayerFlow['justify'], Justify> = {
  start: 'MIN',
  center: 'CENTER',
  end: 'MAX',
  between: 'SPACE_BETWEEN',
};
const ALIGN = {
  start: 'MIN',
  center: 'CENTER',
  end: 'MAX',
  stretch: 'MIN',
  baseline: 'BASELINE',
} as const satisfies Record<LayerFlow['align'], string>;
const TEXT_ALIGN = {
  left: null,
  center: 'CENTER',
  right: 'RIGHT',
  justify: 'JUSTIFIED',
} as const satisfies Record<LayerText['align'], string | null>;
const TEXT_CASE = {
  none: null,
  uppercase: 'UPPER',
  lowercase: 'LOWER',
  capitalize: 'TITLE',
} as const satisfies Record<LayerText['transform'], string | null>;

/** px to two decimals: as much as Figma shows, and short in a script. */
const round = (value: number): number => Math.round(value * 100) / 100;
const unit = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 1e4) / 1e4;
const sides = ([top, right, bottom, left]: Sides): Sides => [
  round(top),
  round(right),
  round(bottom),
  round(left),
];

/** A page colour (`#rrggbbaa`) as the builder takes it: `#rrggbb` when opaque, else black. */
export function hex(colour: Colour): Hex {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(colour.trim());
  if (match === null) return '#000000';
  const rgb = (match[1] ?? '000000').toLowerCase();
  const alpha = (match[2] ?? 'ff').toLowerCase();
  return alpha === 'ff' ? `#${rgb}` : `#${rgb}${alpha}`;
}

/** A Figma colour with channels from 0 to 1 as `#rrggbb` or `#rrggbbaa`. */
function hexOfChannels(value: { r: number; g: number; b: number; a: number }): Hex {
  const byte = (channel: number): string =>
    Math.round(Math.min(1, Math.max(0, channel)) * 255)
      .toString(16)
      .padStart(2, '0');
  return hex(`#${byte(value.r)}${byte(value.g)}${byte(value.b)}${byte(value.a)}`);
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * A value as a JavaScript literal: JSON, with the two line separators JSON leaves raw escaped, so
 * no text of a draft can end a string or a line of the script.
 */
export function literal(value: unknown): string {
  return JSON.stringify(value)
    .split(LINE_SEPARATOR)
    .join('\\u2028')
    .split(PARAGRAPH_SEPARATOR)
    .join('\\u2029');
}

/** A variable's name as Figma takes it: no `.`, `{` or `}` (`space/1.5` is `space/1_5`). */
export function figmaVariableName(name: string): string {
  const clean = name.replace(/\./g, '_').replace(/[{}]/g, '').trim();
  return clean === '' ? '_' : clean;
}

function variableValue(variable: FigmaVariable): VariableData['v'] {
  const { type, value } = variable;
  if (type === 'COLOR') return typeof value === 'object' ? hexOfChannels(value) : '#000000';
  if (type === 'FLOAT') return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return typeof value === 'string' ? value : String(value);
}

/** A kit variable as `10-variables.js` takes it; a scope Figma does not know is left out. */
export function packVariable(variable: FigmaVariable): VariableData {
  return {
    n: figmaVariableName(variable.name),
    t: variable.type,
    v: variableValue(variable),
    s: variable.scopes.filter(isScope),
    c: variable.syntax,
  };
}

/** An image the skill puts on a layer with `upload_assets`; an SVG drawn as vectors is none. */
export function isImageTarget(layer: TreeLayer): boolean {
  return layer.asset !== null && !(layer.node.kind === 'svg' && layer.node.svg !== null);
}

/** Whether a layer is a frame that can hold other layers: not a text, not an SVG drawn as vectors. */
function holds(layer: TreeLayer | undefined): boolean {
  if (layer === undefined) return false;
  const { kind, svg } = layer.node;
  return kind !== 'text' && !(kind === 'svg' && svg !== null);
}

/**
 * The section with every parent able to hold children. A layer inside a text or an SVG (an inline
 * part with an id of its own) moves up to the nearest frame and is placed absolute there, since it
 * is not part of that frame's flow; so is one whose parent does not come before it. A part's stub
 * (`parent` under -1) is kept as it is. Idempotent.
 */
export function normalizeSection(section: TreeSection): TreeSection {
  const { layers } = section;
  let changed = false;
  const next = layers.map((layer, index) => {
    if (layer.parent < -1) return layer;
    let parent = layer.parent >= index ? -1 : layer.parent;
    while (parent >= 0 && !holds(layers[parent])) {
      const up = layers[parent]?.parent ?? -1;
      parent = up >= parent || up < -1 ? -1 : up;
    }
    if (parent === layer.parent) return layer;
    changed = true;
    return { ...layer, parent, node: { ...layer.node, placed: 'absolute' as const } };
  });
  return changed ? { ...section, layers: next } : section;
}

function paintOf(paint: LayerPaint): PackedPaint | null {
  if (paint.kind === 'solid') return hex(paint.colour);
  if (paint.kind === 'image') return null;
  const stops = paint.stops.map((stop): [number, Hex] => [unit(stop.at), hex(stop.colour)]);
  const [first] = stops;
  if (first === undefined) return null;
  if (stops.length < 2) return first[1];
  return [round(paint.angle), ...stops];
}

/** Draws a background, a border or a shadow of its own: a text that does is a frame around it. */
function framed(node: TreeLayer['node']): boolean {
  return (
    node.paints.some((paint) => paint.kind !== 'image') ||
    node.border?.widths.some((width) => width > 0) ||
    node.shadows.length > 0
  );
}

/** Where the text sits across the frame around it: the flex flow's, else the text's own. */
function wrapperJustify(flow: LayerFlow | null, text: LayerText): Justify {
  if (flow?.direction === 'row' && flow.justify !== 'between') return JUSTIFY[flow.justify];
  if (flow?.direction === 'column' && flow.align !== 'stretch' && flow.align !== 'baseline') {
    return ALIGN[flow.align];
  }
  return text.align === 'center' ? 'CENTER' : text.align === 'right' ? 'MAX' : 'MIN';
}

function textOf(text: LayerText, wraps: boolean): PackedText {
  const length = text.characters.length;
  const runs: PackedRun[] = [];
  for (const run of text.runs) {
    const start = Math.max(0, Math.min(length, run.start));
    const end = Math.max(0, Math.min(length, run.end));
    if (start >= end) continue;
    const { weight, italic, underline, colour } = run;
    runs.push([start, end, weight, italic ? 1 : 0, underline ? 1 : 0, hex(colour)]);
  }
  const packed: PackedText = {
    c: text.characters,
    f: text.family,
    w: text.weight,
    z: round(text.size),
    o: hex(text.colour),
  };
  const align = TEXT_ALIGN[text.align];
  const textCase = TEXT_CASE[text.transform];
  if (text.italic) packed.i = 1;
  if (text.lineHeight > 0) packed.h = round(text.lineHeight);
  if (text.letterSpacing !== 0) packed.s = round(text.letterSpacing);
  if (align !== null) packed.a = align;
  if (textCase !== null) packed.x = textCase;
  if (runs.length > 0) packed.r = runs;
  if (wraps) packed.m = 1;
  return packed;
}

/** More than one line: the text is taller than one and a half of its lines. */
function lines(text: LayerText, height: number): boolean {
  const line = text.lineHeight > 0 ? text.lineHeight : text.size * 1.2;
  return line > 0 && height > line * 1.5;
}

type Context = {
  parent: number;
  /** The parent's box (the section's for a child of its frame), in page coordinates. */
  origin: Box;
  /** The parent's flow, when it is a frame with one. */
  flow: LayerFlow | null;
  mark: string | null;
  image: number | null;
  varOf(name: string): number;
};

/** Paints, border, radius, shadows and clipping: all but an SVG's, which draws itself. */
function dress(packed: PackedLayer, node: TreeLayer['node']): void {
  const fills = node.paints.flatMap((paint) => {
    const one = paintOf(paint);
    return one === null ? [] : [one];
  });
  if (fills.length > 0) packed.f = fills;
  const { border } = node;
  if (border?.widths.some((side) => side > 0)) {
    packed.s = [...sides(border.widths), hex(border.colour)];
  }
  if (node.radius.some((corner) => corner > 0)) packed.r = sides(node.radius);
  if (node.shadows.length > 0) {
    packed.e = node.shadows.map(
      (shadow): PackedShadow => [
        round(shadow.x),
        round(shadow.y),
        round(Math.max(0, shadow.blur)),
        round(shadow.spread),
        hex(shadow.colour),
        shadow.inset ? 1 : 0,
      ],
    );
  }
  if (node.clips) packed.c = 1;
}

function packLayer(layer: TreeLayer, context: Context): PackedLayer {
  const { node } = layer;
  const [x, y, width, height] = node.box;
  const [left, top] = context.origin;
  const packed: PackedLayer = {
    p: context.parent,
    n: layer.name,
    b: [round(x - left), round(y - top), round(width), round(height)],
  };
  const text = node.kind === 'text' ? node.text : null;
  const svg = node.kind === 'svg' ? node.svg : null;
  const flow = node.flow;
  if (text !== null) packed.k = 't';
  if (svg !== null) {
    packed.k = 's';
    packed.v = svg;
  }
  const around = text !== null && framed(node);
  const padding = sides(flow?.padding ?? [0, 0, 0, 0]);
  if (text === null && svg === null && flow !== null && flow.direction !== 'none') {
    const { wrap, gap, crossGap, justify, align } = flow;
    const direction = flow.direction === 'row' ? 'H' : 'V';
    const spacing = [wrap ? 1 : 0, round(gap), round(crossGap)] as const;
    packed.l = [direction, ...spacing, ...padding, JUSTIFY[justify], ALIGN[align]];
  } else if (text !== null && around) {
    packed.l = ['H', 0, 0, 0, ...padding, wrapperJustify(flow, text), 'CENTER'];
  }
  if (node.placed === 'absolute') packed.a = 1;
  if (node.fill[0] || node.fill[1]) packed.g = [node.fill[0] ? 1 : 0, node.fill[1] ? 1 : 0];
  if (svg === null) dress(packed, node);
  if (node.opacity < 1) packed.o = Math.round(Math.max(0, node.opacity) * 1000) / 1000;
  if (text !== null) {
    const parent = context.flow?.direction ?? 'none';
    const across = parent === 'row' ? node.fill[0] : parent === 'column' && node.fill[1];
    const inner = around ? height - padding[0] - padding[2] : height;
    const fills = !around && node.placed !== 'absolute' && across;
    packed.t = textOf(text, lines(text, inner) || fills);
  }
  if (context.mark !== null) packed.m = context.mark;
  if (context.image !== null) packed.i = context.image;
  const bound: PackedBound = {};
  for (const property of BOUND) {
    const name = layer.bound[property];
    if (name !== undefined) bound[BOUND_KEY[property]] = context.varOf(figmaVariableName(name));
  }
  if (Object.keys(bound).length > 0) packed.x = bound;
  return packed;
}

export type PackOptions = {
  /** Index in the whole section of the part's first own layer (the one after its stubs). */
  offset?: number;
  /** Indexes in the whole section of the frames a later part continues in. */
  continued?: ReadonlySet<number>;
  /** The number of the part's first image target among the send's. */
  firstImage?: number;
};

/** What a section, or one part of it, gives a layers script. */
export type PackedSection = { vars: string[]; continues: string[]; layers: PackedLayer[] };

/**
 * A section, or a part of one from `splitSection`, as a layers script takes it. A stub (a layer
 * whose `parent` is `-2 - g`, standing for layer g of the whole section, made by an earlier part)
 * becomes an entry of `continues`, the mark `a<g>` that frame carries; the frames named in
 * `continued` get that mark.
 */
export function packedSection(section: TreeSection, options: PackOptions = {}): PackedSection {
  const { layers } = normalizeSection(section);
  const continued = options.continued ?? new Set<number>();
  let global = options.offset ?? 0;
  let image = options.firstImage ?? 0;
  const vars: string[] = [];
  const varIndex = new Map<string, number>();
  const varOf = (name: string): number => {
    const known = varIndex.get(name);
    if (known !== undefined) return known;
    varIndex.set(name, vars.length);
    vars.push(name);
    return vars.length - 1;
  };
  const continues: string[] = [];
  /** Index in `layers` to the parent number a child of it gets. */
  const place = new Map<number, number>();
  const packed: PackedLayer[] = [];
  layers.forEach((layer, index) => {
    if (layer.parent < -1) {
      place.set(index, -2 - continues.length);
      continues.push(`a${-layer.parent - 2}`);
      return;
    }
    const parentLayer = layer.parent >= 0 ? layers[layer.parent] : undefined;
    place.set(index, packed.length);
    packed.push(
      packLayer(layer, {
        parent: layer.parent >= 0 ? (place.get(layer.parent) ?? -1) : -1,
        origin: parentLayer?.node.box ?? section.box,
        flow: parentLayer?.node.flow ?? null,
        mark: continued.has(global) ? `a${global}` : null,
        image: isImageTarget(layer) ? image++ : null,
        varOf,
      }),
    );
    global += 1;
  });
  return { vars, continues, layers: packed };
}
