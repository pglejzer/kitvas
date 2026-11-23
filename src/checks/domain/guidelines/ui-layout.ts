// Guideline entries: ui-layout (page edges, spacing, cards, chrome).

import type { Guideline } from './types.ts';

const PROXIMITY = [
  { name: 'Laws of UX: proximity', url: 'https://lawsofux.com/law-of-proximity/' },
  {
    name: 'NN/g: Gestalt proximity',
    url: 'https://www.nngroup.com/articles/gestalt-proximity/',
  },
] as const;

export const UI_PAGE_OVERFLOW = {
  id: 'ui/page-overflow',
  check: 'ui',
  chapter: 'layout',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: { tolerance: 1, maxReported: 5 },
  sources: [
    {
      name: 'WCAG 2.2: Reflow (1.4.10)',
      url: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
    },
  ],
  screens: null,
  key: 'uiPageOverflow',
} as const satisfies Guideline;

export const UI_CLIPPED_TEXT = {
  id: 'ui/clipped-text',
  check: 'ui',
  chapter: 'layout',
  mode: 'auto',
  severity: 'mixed',
  basis: 'source',
  thresholds: { tolerance: 1 },
  sources: [
    {
      name: 'WCAG 2.2: Resize text (1.4.4)',
      url: 'https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html',
    },
  ],
  screens: null,
  key: 'uiClippedText',
} as const satisfies Guideline;

export const UI_HEADING_GAP = {
  id: 'ui/heading-gap',
  check: 'ui',
  chapter: 'space',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { ratio: 1 },
  sources: PROXIMITY,
  screens: null,
  key: 'uiHeadingGap',
} as const satisfies Guideline;

export const UI_EDGE_GAP = {
  id: 'ui/edge-gap',
  check: 'ui',
  chapter: 'space',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { width: 390, minGap: 16, maxReported: 5 },
  sources: [],
  screens: null,
  key: 'uiEdgeGap',
} as const satisfies Guideline;

export const UI_STRAY_EDGE = {
  id: 'ui/stray-edge',
  check: 'ui',
  chapter: 'space',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { minColumn: 3, minOffset: 2, maxOffset: 4, maxReported: 5 },
  sources: [],
  screens: null,
  key: 'uiStrayEdge',
} as const satisfies Guideline;

export const UI_CARD_SIZES = {
  id: 'ui/card-sizes',
  check: 'ui',
  chapter: 'cards',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { rowTolerance: 4, maxHeightDiff: 8 },
  sources: [],
  screens: null,
  key: 'uiCardSizes',
} as const satisfies Guideline;

export const UI_ORPHAN_CARD = {
  id: 'ui/orphan-card',
  check: 'ui',
  chapter: 'cards',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { rowTolerance: 4, minFullRow: 3 },
  sources: [],
  screens: null,
  key: 'uiOrphanCard',
} as const satisfies Guideline;

/** Also the numbers that decide what a frame and a band are, for every rule about frames. */
export const UI_NESTED_FRAME = {
  id: 'ui/nested-frame',
  check: 'ui',
  chapter: 'cards',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { frameMinWidth: 40, frameMinHeight: 24, bandShare: 0.9, edgeTolerance: 1 },
  sources: [
    { name: 'Laws of UX: common region', url: 'https://lawsofux.com/law-of-common-region/' },
  ],
  screens: null,
  key: 'uiNestedFrame',
} as const satisfies Guideline;

export const UI_TRIPLE_FRAME = {
  id: 'ui/triple-frame',
  check: 'ui',
  chapter: 'cards',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: {},
  sources: [
    { name: 'Atlassian: elevation', url: 'https://atlassian.design/foundations/elevation' },
  ],
  screens: null,
  key: 'uiTripleFrame',
} as const satisfies Guideline;

export const UI_SHADOW_COUNT = {
  id: 'ui/shadow-count',
  check: 'ui',
  chapter: 'cards',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { maxShadows: 4 },
  sources: [
    { name: 'Atlassian: elevation', url: 'https://atlassian.design/foundations/elevation' },
  ],
  screens: null,
  key: 'uiShadowCount',
} as const satisfies Guideline;

export const UI_STICKY_CHROME = {
  id: 'ui/sticky-chrome',
  check: 'ui',
  chapter: 'chrome',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { maxShare: 0.2 },
  sources: [
    { name: 'NN/g: sticky headers', url: 'https://www.nngroup.com/articles/sticky-headers/' },
  ],
  screens: null,
  key: 'uiStickyChrome',
} as const satisfies Guideline;

export const UI_LAYOUT_GUIDELINES: readonly Guideline[] = [
  UI_PAGE_OVERFLOW,
  UI_CLIPPED_TEXT,
  UI_HEADING_GAP,
  UI_EDGE_GAP,
  UI_STRAY_EDGE,
  UI_CARD_SIZES,
  UI_ORPHAN_CARD,
  UI_NESTED_FRAME,
  UI_TRIPLE_FRAME,
  UI_SHADOW_COUNT,
  UI_STICKY_CHROME,
];
