// What the layer walk reads of a built draft page, for the hand-off to Figma (plan 21, goal A2):
// every painted element with its box, flow, paints, border, radius, shadows, text and element id.
// Types and caps only; the walk is `adapters/layers/` (plan 21, task 1).

import type { Box, Colour } from './facts.ts';

/** The walk stops here and says `truncated`; the hand-off refuses a width that hit it. */
export const LAYERS_NODE_CAP = 1500;
/** The longest text of one layer; a longer one is cut and says `truncated`. */
export const LAYER_TEXT_MAX = 2000;
/** The longest inline SVG sent as vectors; a larger one is sent as a picture of itself. */
export const LAYER_SVG_MAX = 4000;

export type LayerPaint =
  | { kind: 'solid'; colour: Colour }
  | { kind: 'linear'; angle: number; stops: { at: number; colour: Colour }[] }
  /** `src`: the address as the page asked for it. */
  | { kind: 'image'; src: string; fit: 'cover' | 'contain' | 'fill' | 'none' };

export type LayerFlow = {
  /** `none`: the children are placed by their boxes (block flow, a grid). */
  direction: 'row' | 'column' | 'none';
  wrap: boolean;
  gap: number;
  crossGap: number;
  padding: [number, number, number, number];
  justify: 'start' | 'center' | 'end' | 'between';
  align: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
};

export type LayerRun = {
  start: number;
  end: number;
  weight: number;
  italic: boolean;
  underline: boolean;
  colour: Colour;
};

export type LayerText = {
  /** As painted, white space collapsed, at most LAYER_TEXT_MAX. */
  characters: string;
  truncated: boolean;
  family: string;
  weight: number;
  italic: boolean;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  align: 'left' | 'center' | 'right' | 'justify';
  transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  colour: Colour;
  /** Inline parts that differ from the block; [] when none. */
  runs: LayerRun[];
};

export type LayerNode = {
  /** Index of the parent in `nodes`; -1 for a child of the root. */
  parent: number;
  ks: string | null;
  ownKs: boolean;
  tag: string;
  box: Box;
  kind: 'frame' | 'text' | 'image' | 'svg';
  placed: 'flow' | 'absolute';
  /** Stretches to its parent along the parent's main axis, its cross axis. */
  fill: [boolean, boolean];
  flow: LayerFlow | null;
  paints: LayerPaint[];
  border: { widths: [number, number, number, number]; colour: Colour } | null;
  radius: [number, number, number, number];
  shadows: { x: number; y: number; blur: number; spread: number; colour: Colour; inset: boolean }[];
  opacity: number;
  clips: boolean;
  text: LayerText | null;
  /** `svg` only: the markup with `currentColor` and custom properties resolved; null over LAYER_SVG_MAX. */
  svg: string | null;
};

export type LayerFacts = {
  viewport: [number, number];
  page: [number, number];
  background: Colour;
  nodes: LayerNode[];
  truncated: boolean;
};
