// One layer of the hand-off inside `use_figma` (plan 21): a frame with auto layout, or with its
// children at their boxes; a text, in a frame of its own when it paints a background, a border or
// a shadow; an SVG as vectors. Every node is appended before it is sized, and FILL and ABSOLUTE
// come after both, as Figma requires. An image is a frame: `upload_assets` puts the picture on it.

import type { Effect, FrameNode, Paint, SceneNode, Transform } from './api.ts';
import {
  attempt,
  boundSolid,
  type Hex,
  type PackedText,
  rgba,
  type Scope,
  variableValue,
  wrapText,
  writeText,
} from './build-text.ts';

export type Justify = 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
export type Align = 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
/** Direction, wrap, gap, cross gap, padding top, right, bottom and left, justify, align. */
export type PackedLayout = [
  'H' | 'V',
  0 | 1,
  number,
  number,
  number,
  number,
  number,
  number,
  Justify,
  Align,
];
/** A CSS angle in degrees, then the stops: where, from 0 to 1, and the colour. */
export type PackedGradient = [number, ...[number, Hex][]];
/** A solid colour or a linear gradient. Images are not here: `upload_assets` puts them on. */
export type PackedPaint = Hex | PackedGradient;
/** x, y, blur, spread, colour, inset. */
export type PackedShadow = [number, number, number, number, Hex, 0 | 1];
/**
 * The bound properties: `f` fill, `s` stroke, `t` text colour, `g` gap, `c` cross gap, `pt`
 * `pr` `pb` `pl` padding, `r` radius, `z` font size, `w` font weight, `y` font family.
 */
export type BoundKey =
  | 'f'
  | 's'
  | 't'
  | 'g'
  | 'c'
  | 'pt'
  | 'pr'
  | 'pb'
  | 'pl'
  | 'r'
  | 'z'
  | 'w'
  | 'y';
/** A bound property to the index of its variable in the script's `vars`. */
export type PackedBound = Partial<Record<BoundKey, number>>;

/** One layer as a script carries it. Absent fields keep Figma's default or mean "none". */
export type PackedLayer = {
  /** The parent: an index in the script's layers, -1 the section's frame, -2 - k `continues[k]`. */
  p: number;
  /** The name, without marks. */
  n: string;
  /** `t` a text, `s` an SVG; absent: a frame (an image is a frame). */
  k?: 't' | 's';
  /** x and y from the parent's top left, width, height. */
  b: [number, number, number, number];
  /** Auto layout; absent: the children sit at their boxes. */
  l?: PackedLayout;
  /** Placed absolute inside an auto-layout parent. */
  a?: 1;
  /** Fills its auto-layout parent along the parent's main axis, along its cross axis. */
  g?: [0 | 1, 0 | 1];
  /** Paints, bottom first. */
  f?: PackedPaint[];
  /** Border: widths top, right, bottom, left, and the colour. */
  s?: [number, number, number, number, Hex];
  /** Radius from the top left, clockwise. */
  r?: [number, number, number, number];
  e?: PackedShadow[];
  /** Opacity, when under 1. */
  o?: number;
  /** Clips what is inside it. */
  c?: 1;
  t?: PackedText;
  /** SVG markup. */
  v?: string;
  /** The mark a later script finds this frame by (`a12`). */
  m?: string;
  /** The number of this image layer among the send's image targets. */
  i?: number;
  x?: PackedBound;
};

/** A layer made: its node, the frame its children go in, and the id of every node it made. */
export type Built = { node: SceneNode; holder: FrameNode; ids: string[] };

const CORNERS = [
  'topLeftRadius',
  'topRightRadius',
  'bottomRightRadius',
  'bottomLeftRadius',
] as const;
const PADDING = [
  ['paddingTop', 'pt'],
  ['paddingRight', 'pr'],
  ['paddingBottom', 'pb'],
  ['paddingLeft', 'pl'],
] as const;

const fine = (value: number): number => Math.round(value * 1e4) / 1e4;

/**
 * The gradient transform of a CSS angle (0 points up, 90 right), in the layer's unit square: the
 * gradient runs from the layer's centre minus half the direction to its centre plus half.
 */
export function gradientTransform(angle: number): Transform {
  const turn = (angle * Math.PI) / 180;
  const dx = Math.sin(turn);
  const dy = -Math.cos(turn);
  return [
    [fine(dx), fine(dy), fine(0.5 - 0.5 * dx - 0.5 * dy)],
    [fine(-dy), fine(dx), fine(0.5 + 0.5 * dy - 0.5 * dx)],
  ];
}

function gradientOf([angle, ...stops]: PackedGradient): Paint | null {
  if (stops.length < 2) return null;
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: gradientTransform(angle),
    gradientStops: stops.map(([at, colour]) => ({
      position: Math.min(1, Math.max(0, at)),
      color: rgba(colour),
    })),
  };
}

/** The layer's paints, a new array: the first solid one bound to the layer's fill variable. */
function fillsOf(scope: Scope, layer: PackedLayer): Paint[] {
  const fills: Paint[] = [];
  let bound = layer.x?.f;
  for (const paint of layer.f ?? []) {
    if (typeof paint === 'string') {
      fills.push(boundSolid(scope, paint, bound));
      bound = undefined;
    } else {
      const gradient = gradientOf(paint);
      if (gradient !== null) fills.push(gradient);
    }
  }
  return fills;
}

function shadowOf([x, y, blur, spread, colour, inset]: PackedShadow): Effect {
  return {
    type: inset === 1 ? 'INNER_SHADOW' : 'DROP_SHADOW',
    color: rgba(colour),
    offset: { x, y },
    radius: Math.max(0, blur),
    spread,
    visible: true,
    blendMode: 'NORMAL',
  };
}

/** Each corner; the radius variable is bound to the corners that have its value. */
function setCorners(scope: Scope, frame: FrameNode, radii: PackedLayer['r'], index?: number) {
  if (radii === undefined) return;
  CORNERS.forEach((field, at) => {
    frame[field] = radii[at] ?? 0;
  });
  const value = variableValue(scope, index);
  const match = typeof value === 'number' ? value : Math.max(...radii);
  attempt(scope, index, (variable) => {
    CORNERS.forEach((field, at) => {
      const radius = radii[at] ?? 0;
      if (radius > 0 && Math.abs(radius - match) < 0.01) frame.setBoundVariable(field, variable);
    });
  });
}

/** Fills, border, radius, shadows, opacity and clipping. */
function dress(scope: Scope, frame: FrameNode, layer: PackedLayer): void {
  const bound = layer.x ?? {};
  // A new frame is white in Figma: a layer that paints nothing gets no fill.
  frame.fills = fillsOf(scope, layer);
  if (layer.s !== undefined) {
    const [top, right, bottom, left, colour] = layer.s;
    frame.strokes = [boundSolid(scope, colour, bound.s)];
    frame.strokeAlign = 'INSIDE';
    if (top === right && right === bottom && bottom === left) frame.strokeWeight = top;
    else {
      frame.strokeTopWeight = top;
      frame.strokeRightWeight = right;
      frame.strokeBottomWeight = bottom;
      frame.strokeLeftWeight = left;
    }
  }
  setCorners(scope, frame, layer.r, bound.r);
  if (layer.e !== undefined) frame.effects = layer.e.map(shadowOf);
  if (layer.o !== undefined) frame.opacity = layer.o;
  frame.clipsContent = layer.c === 1;
}

/** Auto layout: alignment, padding, gap, wrap, and the variables bound to them. */
function setLayout(scope: Scope, frame: FrameNode, layout: PackedLayout, layer: PackedLayer) {
  const [direction, wrap, gap, crossGap, top, right, bottom, left, justify, align] = layout;
  const bound = layer.x ?? {};
  const row = direction === 'H';
  frame.primaryAxisAlignItems = justify;
  frame.counterAxisAlignItems = align === 'BASELINE' && !row ? 'MIN' : align;
  frame.paddingTop = top;
  frame.paddingRight = right;
  frame.paddingBottom = bottom;
  frame.paddingLeft = left;
  if (justify !== 'SPACE_BETWEEN') {
    frame.itemSpacing = gap;
    attempt(scope, bound.g, (variable) => frame.setBoundVariable('itemSpacing', variable));
  }
  if (wrap === 1 && row) {
    frame.layoutWrap = 'WRAP';
    frame.counterAxisSpacing = Math.max(0, crossGap);
    attempt(scope, bound.c, (variable) => frame.setBoundVariable('counterAxisSpacing', variable));
  }
  for (const [field, key] of PADDING) {
    attempt(scope, bound[key], (variable) => frame.setBoundVariable(field, variable));
  }
}

/** Into the parent first; then absolute and at its box, or at its box in a plain frame. */
function attach(node: SceneNode, layer: PackedLayer, parent: FrameNode): void {
  parent.appendChild(node);
  const auto = parent.layoutMode !== 'NONE';
  if (auto && layer.a === 1) node.layoutPositioning = 'ABSOLUTE';
  if (!auto || layer.a === 1) {
    node.x = layer.b[0];
    node.y = layer.b[1];
  }
}

/** The box's size; Figma takes no side under 0.01. */
function sizeTo(node: SceneNode, layer: PackedLayer): void {
  node.resize(Math.max(0.01, layer.b[2]), Math.max(0.01, layer.b[3]));
}

/** FILL along the parent's axes, after the append and the resize. A text fills across when it wraps. */
function stretch(node: SceneNode, layer: PackedLayer, parent: FrameNode, text: boolean): void {
  if (layer.g === undefined || layer.a === 1 || parent.layoutMode === 'NONE') return;
  const [main, cross] = layer.g;
  const row = parent.layoutMode === 'HORIZONTAL';
  if ((row ? main : cross) === 1 && (!text || layer.t?.m === 1)) {
    node.layoutSizingHorizontal = 'FILL';
  }
  if ((row ? cross : main) === 1 && !text) node.layoutSizingVertical = 'FILL';
}

function buildFrame(scope: Scope, layer: PackedLayer, parent: FrameNode, name: string): Built {
  const { figma } = scope;
  const layout = layer.l;
  const frame =
    layout === undefined
      ? figma.createFrame()
      : figma.createAutoLayout(layout[0] === 'H' ? 'HORIZONTAL' : 'VERTICAL');
  frame.name = name;
  if (layout !== undefined) setLayout(scope, frame, layout, layer);
  dress(scope, frame, layer);
  attach(frame, layer, parent);
  sizeTo(frame, layer);
  stretch(frame, layer, parent, false);
  return { node: frame, holder: frame, ids: [frame.id] };
}

/** A text alone, or, when it paints a background, a border or a shadow, a frame around it. */
function buildText(
  scope: Scope,
  layer: PackedLayer,
  text: PackedText,
  parent: FrameNode,
  name: string,
): Built {
  const bound = layer.x ?? {};
  if (layer.f === undefined && layer.s === undefined && layer.e === undefined) {
    const node = scope.figma.createText();
    node.name = name;
    attach(node, layer, parent);
    writeText(scope, node, text, bound);
    if (layer.o !== undefined) node.opacity = layer.o;
    if (text.m === 1) wrapText(node, layer.b[2], layer.b[3]);
    stretch(node, layer, parent, true);
    return { node, holder: parent, ids: [node.id] };
  }
  const justify = text.a === 'CENTER' ? 'CENTER' : text.a === 'RIGHT' ? 'MAX' : 'MIN';
  const layout = layer.l ?? ['H', 0, 0, 0, 0, 0, 0, 0, justify, 'CENTER'];
  const frame = buildFrame(scope, { ...layer, l: layout }, parent, name).holder;
  const node = scope.figma.createText();
  frame.appendChild(node);
  writeText(scope, node, text, bound);
  if (text.m === 1) {
    const [, , , , top, right, bottom, left] = layout;
    wrapText(node, layer.b[2] - left - right, layer.b[3] - top - bottom);
    node.layoutSizingHorizontal = 'FILL';
  }
  return { node: frame, holder: parent, ids: [frame.id, node.id] };
}

function buildSvg(
  scope: Scope,
  layer: PackedLayer,
  svg: string,
  parent: FrameNode,
  name: string,
): Built {
  let node: FrameNode;
  try {
    node = scope.figma.createNodeFromSvg(svg);
  } catch (_unreadable) {
    scope.refused += 1;
    node = scope.figma.createFrame();
    node.fills = [];
  }
  node.name = name;
  if (layer.o !== undefined) node.opacity = layer.o;
  attach(node, layer, parent);
  sizeTo(node, layer);
  stretch(node, layer, parent, false);
  return { node, holder: parent, ids: [node.id] };
}

/** One layer, named `name` (its name and marks), inside `parent`. */
export function buildLayer(
  scope: Scope,
  layer: PackedLayer,
  parent: FrameNode,
  name: string,
): Built {
  if (layer.k === 't' && layer.t !== undefined) {
    return buildText(scope, layer, layer.t, parent, name);
  }
  if (layer.k === 's' && layer.v !== undefined) {
    return buildSvg(scope, layer, layer.v, parent, name);
  }
  return buildFrame(scope, layer, parent, name);
}
