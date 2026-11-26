// The layer tree of a draft as it goes to Figma (plan 21, goals A3 and A4): per width a frame, per
// section a frame named by its layout id, and the layers inside it with their names, the kit
// component each one is the root of, and the tokens bound to its values. `tree.json` of the
// package. Types only; `shape.ts` builds it (plan 21, task 2). The names here are the only names
// that leave the machine: section ids, component names, tags and the first words of a text.

import type { Box, Colour, LayerNode } from '../../../checks/index.ts';

/** The properties a layer can take from a kit token, as Figma variables bind them. */
export const BOUND = [
  'fill',
  'stroke',
  'text',
  'gap',
  'cross-gap',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'radius',
  'font-size',
  'font-weight',
  'font-family',
] as const;
export type BoundProperty = (typeof BOUND)[number];

export type TreeLayer = {
  /** Index in the section's `layers`; -1 for a child of the section's frame. */
  parent: number;
  name: string;
  /** The kit component this layer is the root of. */
  component: string | null;
  node: Omit<LayerNode, 'parent' | 'ks' | 'ownKs' | 'tag'>;
  /** Variable name (`color/ink`) per bound property. */
  bound: Partial<Record<BoundProperty, string>>;
  /** File in `assets/` for an image layer. */
  asset: string | null;
};

export type TreeSection = { id: string; box: Box; layers: TreeLayer[] };

export type TreeFrame = {
  width: number;
  height: number;
  background: Colour;
  sections: TreeSection[];
};

export type HandoffTree = {
  schemaVersion: 1;
  slug: string;
  version: number;
  kit: string;
  state: string;
  sendId: string;
  frames: TreeFrame[];
  fonts: { family: string; weight: number; italic: boolean }[];
  counts: { layers: number; texts: number; images: number; icons: number };
  unbound: number;
};
