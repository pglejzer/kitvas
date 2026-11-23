// Guideline entries: ui-look (hierarchy, colour, media, the wireframe look).

import type { Guideline } from './types.ts';

const HIERARCHY_SOURCE = [
  {
    name: 'NN/g: visual hierarchy',
    url: 'https://www.nngroup.com/articles/visual-hierarchy-ux-definition/',
  },
] as const;

export const UI_MANY_LARGE = {
  id: 'ui/many-large',
  check: 'ui',
  chapter: 'hierarchy',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { largeFactor: 1.75, maxLarge: 2 },
  sources: HIERARCHY_SOURCE,
  screens: null,
  key: 'uiManyLarge',
} as const satisfies Guideline;

export const UI_FLAT_HIERARCHY = {
  id: 'ui/flat-hierarchy',
  check: 'ui',
  chapter: 'hierarchy',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { minBlocks: 3, maxShare: 0.85 },
  sources: HIERARCHY_SOURCE,
  screens: null,
  key: 'uiFlatHierarchy',
} as const satisfies Guideline;

export const UI_HUE_COUNT = {
  id: 'ui/hue-count',
  check: 'ui',
  chapter: 'look',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { maxHues: 4 },
  sources: HIERARCHY_SOURCE,
  screens: null,
  key: 'uiHueCount',
} as const satisfies Guideline;

export const UI_IMAGE_DISTORTED = {
  id: 'ui/image-distorted',
  check: 'ui',
  chapter: 'media',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { maxDrift: 0.05 },
  sources: [],
  screens: null,
  key: 'uiImageDistorted',
} as const satisfies Guideline;

export const UI_PLACEHOLDER_MEDIA = {
  id: 'ui/placeholder-media',
  check: 'ui',
  chapter: 'media',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: {
    minWidth: 80,
    minHeight: 60,
    minRatio: 0.5,
    maxRatio: 2.5,
    minBoxes: 2,
    maxReported: 6,
  },
  sources: [],
  screens: null,
  key: 'uiPlaceholderMedia',
} as const satisfies Guideline;

export const UI_WIREFRAME = {
  id: 'ui/wireframe',
  check: 'ui',
  chapter: 'look',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { minSignals: 3, minBlocks: 3 },
  sources: [],
  screens: null,
  key: 'uiWireframe',
} as const satisfies Guideline;

export const UI_LOOK_GUIDELINES: readonly Guideline[] = [
  UI_MANY_LARGE,
  UI_FLAT_HIERARCHY,
  UI_HUE_COUNT,
  UI_IMAGE_DISTORTED,
  UI_PLACEHOLDER_MEDIA,
  UI_WIREFRAME,
];
