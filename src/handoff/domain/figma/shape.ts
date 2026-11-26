// The layer walk as the tree that goes to Figma (plan 21, goals A3 and A4): per width a frame, per
// layout section a frame, and the layers inside it, each with its name, the kit component it is the
// root of, the tokens bound to its values and the file of its image. Pure.
//
// Boxes stay as the walk measured them, in page coordinates: a layer's place inside its parent is
// its box minus the parent's box (a child of the section's frame: minus the section's box).

import type { Box, LayerFacts, LayerNode, LayerPaint } from '../../../checks/index.ts';
import type { FlatToken } from '../../../kit/index.ts';
import type { IdsFile } from '../../../render/index.ts';
import { pascal } from '../../../shared/index.ts';
import { bindLayer, rawValues } from './bind.ts';
import { componentOf, layerName } from './names.ts';
import type { TokenUses } from './token-uses.ts';
import type { HandoffTree, TreeFrame, TreeLayer, TreeSection } from './tree.ts';

/** Where a layer outside every layout section goes. */
export const PAGE_SECTION = 'page';

export type ShapeInput = {
  slug: string;
  version: number;
  kit: string;
  state: string;
  sendId: string;
  frames: { width: number; facts: LayerFacts }[];
  ids: IdsFile;
  /** The layout's section ids, in its order. */
  sections: string[];
  tokens: readonly FlatToken[];
  uses: TokenUses;
  /** The file in `assets/` for an image address the page asked for; null when there is none. */
  assetOf(src: string): string | null;
};

const SECTION_FILE = /(?:^|\/)sections\/([A-Za-z0-9]+)\.tsx$/;

function unionBox(boxes: readonly Box[]): Box {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const [x, y, width, height] of boxes) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  }
  return [left, top, right - left, bottom - top];
}

function shapeFrame(
  width: number,
  facts: LayerFacts,
  input: ShapeInput,
  sectionOfName: ReadonlyMap<string, string>,
): { frame: TreeFrame; unbound: number } {
  const { nodes } = facts;
  const entryOf = (ks: string | null) =>
    ks !== null && Object.hasOwn(input.ids.ids, ks) ? input.ids.ids[ks] : undefined;

  /** The section of a node: the file of its nearest element id, else `page`. */
  const sectionOf = (node: LayerNode): string => {
    if (node.ks === null) return PAGE_SECTION;
    const file = entryOf(node.ks)?.file ?? `${node.ks.split(':')[0] ?? ''}.tsx`;
    const name = SECTION_FILE.exec(file)?.[1];
    return (name === undefined ? undefined : sectionOfName.get(name)) ?? PAGE_SECTION;
  };

  const owner = nodes.map(sectionOf);
  const members = new Map<string, number[]>();
  for (const [index, id] of owner.entries()) {
    const list = members.get(id) ?? [];
    list.push(index);
    members.set(id, list);
  }
  const local = new Map<number, number>();
  for (const list of members.values()) {
    for (const [at, index] of list.entries()) local.set(index, at);
  }

  let unbound = 0;
  const shape = (node: LayerNode, index: number): TreeLayer => {
    const entry = entryOf(node.ownKs ? node.ks : null);
    const tag = entry?.tag ?? null;
    const bound = bindLayer(node, input.tokens, input.uses);
    unbound += rawValues(node, bound);
    const files = node.paints.map((paint) =>
      paint.kind === 'image' ? input.assetOf(paint.src) : null,
    );
    // The address the page asked for may be a path or a link: only the asset's file name leaves.
    const paints: LayerPaint[] = node.paints.map((paint, at) =>
      paint.kind === 'image' ? { ...paint, src: files[at] ?? '' } : paint,
    );
    const parentOwner = node.parent >= 0 ? owner[node.parent] : undefined;
    return {
      parent: parentOwner === owner[index] ? (local.get(node.parent) ?? -1) : -1,
      name: layerName(node, tag),
      component: componentOf(node, tag),
      node: {
        box: node.box,
        kind: node.kind,
        placed: node.placed,
        fill: node.fill,
        flow: node.flow,
        paints,
        border: node.border,
        radius: node.radius,
        shadows: node.shadows,
        opacity: node.opacity,
        clips: node.clips,
        text: node.text,
        svg: node.svg,
      },
      bound,
      asset: files.find((file) => file !== null) ?? null,
    };
  };

  const order = input.sections.includes(PAGE_SECTION)
    ? input.sections
    : [PAGE_SECTION, ...input.sections];
  const sections: TreeSection[] = [];
  for (const id of order) {
    const list = members.get(id);
    if (list === undefined || list.length === 0) continue;
    const layers = list.flatMap((index) => {
      const node = nodes[index];
      return node === undefined ? [] : [shape(node, index)];
    });
    sections.push({ id, box: unionBox(layers.map((layer) => layer.node.box)), layers });
  }
  return {
    frame: { width, height: facts.page[1], background: facts.background, sections },
    unbound,
  };
}

export function shapeTree(input: ShapeInput): HandoffTree {
  const sectionOfName = new Map(input.sections.map((id) => [pascal(id), id] as const));
  const frames: TreeFrame[] = [];
  let unbound = 0;
  for (const { width, facts } of input.frames) {
    const shaped = shapeFrame(width, facts, input, sectionOfName);
    frames.push(shaped.frame);
    unbound += shaped.unbound;
  }

  const counts = { layers: 0, texts: 0, images: 0, icons: 0 };
  const fonts = new Map<string, { family: string; weight: number; italic: boolean }>();
  const addFont = (family: string, weight: number, italic: boolean): void => {
    fonts.set(`${family}|${weight}|${italic}`, { family, weight, italic });
  };
  for (const frame of frames) {
    for (const section of frame.sections) {
      for (const { node } of section.layers) {
        counts.layers += 1;
        if (node.kind === 'text') counts.texts += 1;
        if (node.kind === 'image') counts.images += 1;
        if (node.kind === 'svg') counts.icons += 1;
        const { text } = node;
        if (text === null) continue;
        addFont(text.family, text.weight, text.italic);
        for (const run of text.runs) addFont(text.family, run.weight, run.italic);
      }
    }
  }

  return {
    schemaVersion: 1,
    slug: input.slug,
    version: input.version,
    kit: input.kit,
    state: input.state,
    sendId: input.sendId,
    frames,
    fonts: [...fonts.values()].sort(
      (a, b) =>
        a.family.localeCompare(b.family) ||
        a.weight - b.weight ||
        Number(a.italic) - Number(b.italic),
    ),
    counts,
    unbound,
  };
}
