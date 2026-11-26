// The pure half of the layer walk (plan 21, task 1): the computed CSS values the page walk hands
// over (`adapters/layers/`) read into the layer types of `layers.ts`. The page paints every colour
// it meets as `#rrggbbaa` before it hands a value over (oklch, hsl and names included); the readers
// also take `rgb()`, `rgba()` and short hex, as a browser computes and a test writes them.

import { clamp } from '../../../shared/index.ts';
import type { Box, Colour } from './facts.ts';
import type {
  LayerFacts,
  LayerFlow,
  LayerNode,
  LayerPaint,
  LayerRun,
  LayerText,
} from './layers.ts';

/** One element, or a run of inline text, as the page walk reads it. */
export type RawLayer = {
  parent: number;
  ks: string | null;
  ownKs: boolean;
  tag: string;
  box: Box;
  /** `frame` becomes `image` here when its only paint is an image and it holds nothing. */
  kind: LayerNode['kind'];
  /** The computed `position`. */
  position: string;
  fill: [boolean, boolean];
  /** The computed values `readFlow` reads, by property name; null for a text, an image, an svg. */
  flow: Record<string, string> | null;
  /** The background colour as painted; '' when none. */
  background: string;
  /** `background-image` with its colours painted, or `url("…")` of an `img`; '' or `none`. */
  image: string;
  /** `object-fit` of an `img`, else `background-size`. */
  fit: string;
  border: LayerNode['border'];
  radius: LayerNode['radius'];
  /** `box-shadow` with its colours painted; '' or `none`. */
  shadow: string;
  opacity: number;
  clips: boolean;
  text: LayerText | null;
  svg: string | null;
};

export type RawLayers = Omit<LayerFacts, 'nodes'> & { nodes: RawLayer[] };

const round = (value: number, places = 2): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};
const pair = (channel: number): string =>
  Math.round(clamp(channel, 0, 255))
    .toString(16)
    .padStart(2, '0');
/** A colour that lets everything under it through. */
const clear = (colour: Colour): boolean => colour.slice(7, 9) === '00';

/** A CSS value cut at its top-level commas or white space, never inside brackets or quotes. */
export function splitTop(value: string, by: 'comma' | 'space'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (let at = 0; at < value.length; at += 1) {
    const char = value.charAt(at);
    if (quote !== '') {
      current += char;
      if (char === '\\') {
        current += value.charAt(at + 1);
        at += 1;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    const breaks = by === 'comma' ? char === ',' : /\s/.test(char);
    if (breaks && depth === 0 && quote === '') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts.filter((part) => part !== '');
}

/** A colour as `#rrggbbaa`: hex, `rgb()`, `rgba()` or `transparent`; null for anything else. */
export function readColour(value: string): Colour | null {
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return '#00000000';
  const hex = /^#([0-9a-f]+)$/.exec(text)?.[1];
  if (hex !== undefined) {
    if (hex.length === 3 || hex.length === 4) {
      const full = [...hex].map((digit) => `${digit}${digit}`).join('');
      return `#${full}${hex.length === 3 ? 'ff' : ''}`;
    }
    if (hex.length === 6) return `#${hex}ff`;
    return hex.length === 8 ? `#${hex}` : null;
  }
  const inner = /^rgba?\(([^()]*)\)$/.exec(text)?.[1];
  if (inner === undefined) return null;
  const parts = inner.split(/[\s,/]+/).filter((part) => part !== '');
  if (parts.length < 3 || parts.length > 4) return null;
  const number = (part: string, full: number): number => {
    const parsed = Number.parseFloat(part);
    return part.endsWith('%') ? (parsed * full) / 100 : parsed;
  };
  const [red = '', green = '', blue = '', alpha = '1'] = parts;
  const channels = [
    number(red, 255),
    number(green, 255),
    number(blue, 255),
    number(alpha, 1) * 255,
  ];
  if (channels.some((channel) => !Number.isFinite(channel))) return null;
  return `#${channels.map(pair).join('')}`;
}

const FITS: Record<string, 'cover' | 'contain' | 'fill'> = {
  cover: 'cover',
  contain: 'contain',
  'scale-down': 'contain',
  fill: 'fill',
  '100% 100%': 'fill',
};
const fitOf = (value: string): 'cover' | 'contain' | 'fill' | 'none' =>
  FITS[value.trim().toLowerCase().replace(/\s+/g, ' ')] ?? 'none';

/** The whole value as one call, `name(inner)`; null when it is none. */
const callOf = (value: string): { name: string; inner: string } | null => {
  const match = /^(-?[a-z][a-z0-9-]*)\((.*)\)$/is.exec(value.trim());
  return match ? { name: (match[1] ?? '').toLowerCase(), inner: match[2] ?? '' } : null;
};

/** The address inside `url(…)`, unquoted. */
const urlOf = (inner: string): string => {
  const text = inner.trim();
  const quote = text.charAt(0);
  if ((quote === '"' || quote === "'") && text.length > 1 && text.endsWith(quote)) {
    return text.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return text;
};

type Stop = { colour: Colour; at: number | null };

/**
 * The colour stops of a gradient's arguments, with their places from 0 to 1 when they are
 * percentages. A length is placed as CSS would place a stop with none: where it falls needs the
 * box. A colour hint, a shape or a position has no colour and is skipped.
 */
const stopsOf = (parts: readonly string[]): Stop[] => {
  const stops: Stop[] = [];
  for (const part of parts) {
    let colour: Colour | null = null;
    const places: (number | null)[] = [];
    for (const token of splitTop(part, 'space')) {
      const read: Colour | null = colour === null ? readColour(token) : null;
      if (read !== null) {
        colour = read;
        continue;
      }
      const number = Number.parseFloat(token);
      if (!Number.isFinite(number)) continue;
      if (token.endsWith('%')) places.push(number / 100);
      else places.push(number === 0 ? 0 : null);
    }
    if (colour === null) continue;
    if (places.length === 0) stops.push({ colour, at: null });
    for (const at of places.slice(0, 2)) stops.push({ colour, at });
  }
  return stops;
};

/** Places the stops that have none as CSS does: the ends at 0 and 1, the rest evenly between. */
const placed = (stops: readonly Stop[]): { at: number; colour: Colour }[] => {
  const places = stops.map((stop) => stop.at);
  const last = places.length - 1;
  if (last < 0) return [];
  if (places[0] === null) places[0] = 0;
  if (places[last] === null) places[last] = 1;
  // A stop placed before an earlier one is moved up to it.
  let highest = 0;
  places.forEach((place, at) => {
    if (place === null) return;
    highest = Math.max(highest, place);
    places[at] = highest;
  });
  for (let at = 1; at < last; at += 1) {
    if (places[at] !== null) continue;
    let end = at;
    while (places[end] === null) end += 1;
    const from = places[at - 1] ?? 0;
    const to = places[end] ?? 1;
    const steps = end - at + 1;
    for (let step = at; step < end; step += 1) {
      places[step] = from + ((to - from) * (step - at + 1)) / steps;
    }
    at = end;
  }
  return stops.map((stop, at) => ({
    at: round(clamp(places[at] ?? 0, 0, 1), 4),
    colour: stop.colour,
  }));
};

const SIDES: Record<string, number> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
  'top right': 45,
  'right top': 45,
  'bottom right': 135,
  'right bottom': 135,
  'bottom left': 225,
  'left bottom': 225,
  'top left': 315,
  'left top': 315,
};
const DEGREES: Record<string, number> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

/**
 * The direction of a linear gradient in CSS degrees (0 up, 90 right, clockwise), from its first
 * argument; null when that argument is a colour stop. A corner is taken at 45 degrees, whatever
 * the box's sides.
 */
const angleOf = (part: string): number | null => {
  const text = part
    .toLowerCase()
    .replace(/\bin\s+[a-z-]+(\s+[a-z]+\s+hue)?/, '')
    .trim();
  if (text === '') return 180;
  if (text.startsWith('to ')) return SIDES[text.slice(3).trim().replace(/\s+/g, ' ')] ?? null;
  const match = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)(deg|grad|rad|turn)$/.exec(text);
  if (!match) return null;
  const degrees = Number(match[1]) * (DEGREES[match[2] ?? ''] ?? 1);
  return round(((degrees % 360) + 360) % 360);
};

const ofStops = (angle: number, stops: { at: number; colour: Colour }[]): LayerPaint | null => {
  const [first] = stops;
  if (first === undefined) return null;
  if (stops.length === 1) return { kind: 'solid', colour: first.colour };
  return { kind: 'linear', angle, stops };
};

/** One background layer; null when it paints nothing Figma can be given. */
const layerOf = (part: string, fit: string): LayerPaint | null => {
  const call = callOf(part);
  if (call === null) return null;
  if (call.name === 'url') return { kind: 'image', src: urlOf(call.inner), fit: fitOf(fit) };
  if (call.name === 'image-set' || call.name === '-webkit-image-set') {
    const [first = ''] = splitTop(splitTop(call.inner, 'comma')[0] ?? '', 'space');
    return first === '' ? null : layerOf(callOf(first) ? first : `url(${first})`, fit);
  }
  if (call.name === 'linear-gradient') {
    const parts = splitTop(call.inner, 'comma');
    const angle = angleOf(parts[0] ?? '');
    return ofStops(angle ?? 180, placed(stopsOf(angle === null ? parts : parts.slice(1))));
  }
  if (!call.name.endsWith('-gradient')) return null;
  // Any other gradient (radial, conic, repeating) is sent as its first colour.
  const [first] = stopsOf(splitTop(call.inner, 'comma'));
  if (first === undefined || clear(first.colour)) return null;
  return { kind: 'solid', colour: first.colour };
};

/**
 * What a box paints, bottom first: its background colour, then its background layers (CSS lists
 * the top one first), each a linear gradient, an image with how it fits, or the first colour of
 * any other gradient. `fit` is the comma list of `background-size`, or an `img`'s `object-fit`.
 */
export function readPaints(background: string, image: string, fit: string): LayerPaint[] {
  const paints: LayerPaint[] = [];
  const colour = readColour(background);
  if (colour !== null && !clear(colour)) paints.push({ kind: 'solid', colour });
  const layers = ['', 'none'].includes(image.trim()) ? [] : splitTop(image, 'comma');
  const fits = splitTop(fit, 'comma');
  const read = layers.map((part, at) => layerOf(part, fits[at] ?? fits[fits.length - 1] ?? ''));
  for (const paint of read.reverse()) if (paint !== null) paints.push(paint);
  return paints;
}

/** `box-shadow` as the browser computes it: one shadow per comma, a transparent one left out. */
export function readShadows(css: string): LayerNode['shadows'] {
  const text = css.trim();
  if (text === '' || text === 'none') return [];
  const shadows: LayerNode['shadows'] = [];
  for (const part of splitTop(text, 'comma')) {
    let colour: Colour | null = null;
    let inset = false;
    const lengths: number[] = [];
    for (const token of splitTop(part, 'space')) {
      if (token.toLowerCase() === 'inset') {
        inset = true;
        continue;
      }
      if (/^-?\d*\.?\d+(px)?$/.test(token)) {
        lengths.push(Number.parseFloat(token));
        continue;
      }
      colour ??= readColour(token);
    }
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
    if (colour === null || clear(colour) || lengths.length < 2) continue;
    shadows.push({
      x: round(x),
      y: round(y),
      blur: round(blur),
      spread: round(spread),
      colour,
      inset,
    });
  }
  return shadows;
}

const JUSTIFY: Record<string, LayerFlow['justify']> = {
  center: 'center',
  'flex-end': 'end',
  end: 'end',
  right: 'end',
  // Figma spreads children only from edge to edge.
  'space-between': 'between',
  'space-around': 'between',
  'space-evenly': 'between',
};
const ALIGN: Record<string, LayerFlow['align']> = {
  center: 'center',
  'flex-end': 'end',
  end: 'end',
  'self-end': 'end',
  'flex-start': 'start',
  start: 'start',
  'self-start': 'start',
  baseline: 'baseline',
  'first baseline': 'baseline',
  'last baseline': 'baseline',
};

/**
 * How a frame lays out its children, from its computed style by property name. A flex line is a
 * row or a column, with the gap along it and the gap across; a grid, block flow and a reversed
 * flex line are `none`: Figma lays children out only in their own order, so those are placed by
 * their boxes.
 */
export function readFlow(style: Readonly<Record<string, string>>): LayerFlow {
  const value = (name: string): string =>
    (style[name] ?? '')
      .trim()
      .toLowerCase()
      .replace(/^(un)?safe\s+/, '');
  const length = (name: string): number => {
    const number = Number.parseFloat(value(name));
    return Number.isFinite(number) ? round(number) : 0;
  };
  const display = value('display');
  const direction = value('flex-direction');
  const padding: LayerFlow['padding'] = [
    length('padding-top'),
    length('padding-right'),
    length('padding-bottom'),
    length('padding-left'),
  ];
  const flex = (display === 'flex' || display === 'inline-flex') && !direction.endsWith('reverse');
  if (!flex) {
    return {
      direction: 'none',
      wrap: false,
      gap: 0,
      crossGap: 0,
      padding,
      justify: 'start',
      align: 'start',
    };
  }
  const column = direction.startsWith('column');
  return {
    direction: column ? 'column' : 'row',
    wrap: value('flex-wrap').startsWith('wrap'),
    gap: length(column ? 'row-gap' : 'column-gap'),
    crossGap: length(column ? 'column-gap' : 'row-gap'),
    padding,
    justify: JUSTIFY[value('justify-content')] ?? 'start',
    align: ALIGN[value('align-items')] ?? 'stretch',
  };
}

const sameLook = (one: LayerRun, other: LayerRun): boolean =>
  one.weight === other.weight &&
  one.italic === other.italic &&
  one.underline === other.underline &&
  one.colour === other.colour;

/** The runs in order of their start; those that touch or overlap with one look are one run. */
export function mergeRuns(runs: readonly LayerRun[]): LayerRun[] {
  const sorted = runs
    .filter((run) => run.end > run.start)
    .map((run) => ({ ...run }))
    .sort((one, other) => one.start - other.start || one.end - other.end);
  const merged: LayerRun[] = [];
  for (const run of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && run.start <= last.end && sameLook(last, run)) {
      last.end = Math.max(last.end, run.end);
    } else {
      merged.push(run);
    }
  }
  return merged;
}

const OUT_OF_FLOW = new Set(['absolute', 'fixed', 'sticky']);

/** What the page walk handed over, read into the layers the hand-off sends. */
export function layerFacts(raw: RawLayers): LayerFacts {
  const held = raw.nodes.map(() => 0);
  for (const node of raw.nodes) {
    if (node.parent >= 0) held[node.parent] = (held[node.parent] ?? 0) + 1;
  }
  const nodes = raw.nodes.map((node, at): LayerNode => {
    const paints = readPaints(node.background, node.image, node.fit);
    const shadows = readShadows(node.shadow);
    const onlyImage =
      paints.length === 1 &&
      paints[0]?.kind === 'image' &&
      node.border === null &&
      shadows.length === 0;
    const kind = node.kind === 'frame' && onlyImage && held[at] === 0 ? 'image' : node.kind;
    return {
      parent: node.parent,
      ks: node.ks,
      ownKs: node.ownKs,
      tag: node.tag,
      box: node.box,
      kind,
      placed: OUT_OF_FLOW.has(node.position) ? 'absolute' : 'flow',
      fill: node.fill,
      flow: kind === 'frame' && node.flow !== null ? readFlow(node.flow) : null,
      paints,
      border: node.border,
      radius: node.radius,
      shadows,
      opacity: node.opacity,
      clips: node.clips,
      text: node.text === null ? null : { ...node.text, runs: mergeRuns(node.text.runs) },
      svg: node.svg,
    };
  });
  return {
    viewport: raw.viewport,
    page: raw.page,
    background: raw.background,
    nodes,
    truncated: raw.truncated,
  };
}
