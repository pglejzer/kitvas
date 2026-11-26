// The steps of a send to Figma (plan 21, goal A5): the names the scripts find things by, the data
// of the steps that are not a section's layers, and the manifest's list of steps in the order the
// skill runs them. The descriptions are for the skill, which says in its own words what runs. Pure.

import type {
  CloseData,
  FramesData,
  InspectData,
  SectionSpec,
  TargetsData,
} from '../../../../../client/figma/builder.ts';
import type { FigmaStep } from '../manifest.ts';
import type { HandoffTree } from '../tree.ts';
import { hex, isImageTarget } from './pack.ts';
import type { FigmaScript } from './scripts.ts';

/** The script whose return is the image layers' ids, in the order of the assets step's items. */
export const FIGMA_TARGETS_FILE = '40-image-targets.js';

export const STEP_DESCRIPTIONS = {
  inspect:
    "Reads the file: its pages, the kit's collection, the fonts Figma lacks. Changes nothing.",
  variables: "Adds the kit's collection and the variables the file lacks; keeps those it has.",
  frames: 'Adds the page, a frame per width right of what is there, a placeholder per section.',
  targets: 'Reads the ids of the image layers, in the order of the assets. Changes nothing.',
  close: 'Removes the marks and placeholders; returns the frames, the counts, the missing fonts.',
} as const;

export function layersDescription(section: string, width: number, part: number, parts: number) {
  const which = parts > 1 ? `, part ${part} of ${parts}` : '';
  return `Builds section "${section}" at ${width} px${which}.`;
}

type Named = Pick<HandoffTree, 'slug' | 'version' | 'sendId'>;

/** The page a draft goes to: `kitvas · <slug>`. */
export const figmaPageName = (slug: string): string => `kitvas · ${slug}`;
/** The kit's variable collection: `kitvas · <kit>`. */
export const figmaCollectionName = (kit: string): string => `kitvas · ${kit}`;
/** A width's frame after the close: `<slug> v<N> · <width>`. */
export const figmaFinalFrameName = (tree: Named, width: number): string =>
  `${tree.slug} v${tree.version} · ${width}`;
/** A width's frame while the send runs: `<slug> v<N> · <width> · <sendId>`. */
export const figmaFrameName = (tree: Named, width: number): string =>
  `${figmaFinalFrameName(tree, width)} · ${tree.sendId}`;

/** The families the tree's texts ask for, each once, in the order met. */
export const treeFamilies = (tree: HandoffTree): string[] => [
  ...new Set(tree.fonts.map((font) => font.family)),
];

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** An asset's content type by its extension; `image/png` for one it does not know. */
export function imageContentType(file: string): string {
  const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? 'image/png';
}

/**
 * The assets step's items: one per image layer, per width, section and layer in that order, which
 * is the order `40-image-targets.js` returns the layers' ids in. `file` is a name in `assets/`.
 */
export function imageItems(tree: HandoffTree): { file: string; contentType: string }[] {
  const items: { file: string; contentType: string }[] = [];
  for (const frame of tree.frames) {
    for (const section of frame.sections) {
      for (const layer of section.layers) {
        if (layer.asset === null || !isImageTarget(layer)) continue;
        items.push({ file: layer.asset, contentType: imageContentType(layer.asset) });
      }
    }
  }
  return items;
}

const box = ([x, y, width, height]: [number, number, number, number]): SectionSpec[1] => [
  Math.round(x * 100) / 100,
  Math.round(y * 100) / 100,
  Math.round(width * 100) / 100,
  Math.round(height * 100) / 100,
];

export const inspectData = (tree: HandoffTree): InspectData => ({
  page: figmaPageName(tree.slug),
  collection: figmaCollectionName(tree.kit),
  families: treeFamilies(tree),
});

/** `parts[f][s]`: the number of layers scripts of section s at width f; 0 makes no placeholder. */
export function framesData(tree: HandoffTree, parts: readonly (readonly number[])[]): FramesData {
  return {
    page: figmaPageName(tree.slug),
    frames: tree.frames.map((frame, at) => ({
      n: figmaFrameName(tree, frame.width),
      w: frame.width,
      h: Math.round(frame.height * 100) / 100,
      c: hex(frame.background),
      s: frame.sections.map(
        (section, index): SectionSpec => [section.id, box(section.box), parts[at]?.[index] ?? 0],
      ),
    })),
  };
}

export const targetsData = (tree: HandoffTree, count: number): TargetsData => ({
  page: figmaPageName(tree.slug),
  frames: tree.frames.map((frame) => figmaFrameName(tree, frame.width)),
  count,
});

export const closeData = (tree: HandoffTree): CloseData => ({
  page: figmaPageName(tree.slug),
  frames: tree.frames.map((frame): CloseData['frames'][number] => [
    figmaFrameName(tree, frame.width),
    figmaFinalFrameName(tree, frame.width),
    frame.width,
  ]),
  families: treeFamilies(tree),
});

/** The manifest's steps: each script in order, and the upload of the images after their targets. */
export function figmaSteps(
  scripts: readonly FigmaScript[],
  items: readonly { file: string; contentType: string }[],
): FigmaStep[] {
  const steps: FigmaStep[] = [];
  for (const { file, description, writes } of scripts) {
    steps.push({ kind: 'script', file, description, writes });
    if (file === FIGMA_TARGETS_FILE && items.length > 0) {
      steps.push({ kind: 'assets', targets: FIGMA_TARGETS_FILE, items: [...items] });
    }
  }
  return steps;
}
