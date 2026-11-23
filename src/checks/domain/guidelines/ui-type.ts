// Guideline entries: ui-type (typography). The numbers here are the only ones the rules use.

import type { Guideline } from './types.ts';

const WCAG_VISUAL = {
  name: 'WCAG 2.2 Understanding 1.4.8 Visual Presentation',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html',
} as const;
const USWDS_TYPE = {
  name: 'USWDS Typography',
  url: 'https://designsystem.digital.gov/components/typography/',
} as const;
const NNG_HIERARCHY = {
  name: 'NN/g Visual Hierarchy',
  url: 'https://www.nngroup.com/articles/visual-hierarchy-ux-definition/',
} as const;

export const UI_LINE_LENGTH = {
  id: 'ui/line-length',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  // `maxChars`: WCAG 1.4.8 and Baymard; `bandLow` and `bandHigh` are the comfortable band.
  thresholds: { minLines: 3, maxChars: 80, bandLow: 45, bandHigh: 90 },
  sources: [
    WCAG_VISUAL,
    { name: 'Baymard line length', url: 'https://baymard.com/blog/line-length-readability' },
    { name: 'Butterick line length', url: 'https://practicaltypography.com/line-length.html' },
    USWDS_TYPE,
  ],
  screens: null,
  key: 'uiLineLength',
} as const satisfies Guideline;

export const UI_LINE_HEIGHT = {
  id: 'ui/line-height',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  // Ratio of line height to font size; the sources range from 1.2 to 1.5, so the band is wider.
  thresholds: { minLines: 3, min: 1.3, max: 1.8 },
  sources: [
    { name: 'Butterick line spacing', url: 'https://practicaltypography.com/line-spacing.html' },
    USWDS_TYPE,
    WCAG_VISUAL,
  ],
  screens: null,
  key: 'uiLineHeight',
} as const satisfies Guideline;

export const UI_HEADING_LINE_HEIGHT = {
  id: 'ui/heading-line-height',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { minLines: 2, min: 1, max: 1.35 },
  sources: [USWDS_TYPE],
  screens: null,
  key: 'uiHeadingLineHeight',
} as const satisfies Guideline;

export const UI_TEXT_SIZE = {
  id: 'ui/text-size',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  // `width`: the rule looks only at the phone visit. `bodyMin` is sourced; `anyMin` is a heuristic.
  thresholds: { width: 390, minLines: 3, bodyMin: 14, anyMin: 12 },
  sources: [
    NNG_HIERARCHY,
    { name: 'Fluent 2 typography', url: 'https://fluent2.microsoft.design/typography' },
  ],
  screens: null,
  key: 'uiTextSize',
} as const satisfies Guideline;

export const UI_TYPE_SIZES = {
  id: 'ui/type-sizes',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  // `share`: a size counts when it holds at least this part of all characters.
  thresholds: { maxSizes: 5, share: 0.02 },
  sources: [NNG_HIERARCHY],
  screens: null,
  key: 'uiTypeSizes',
} as const satisfies Guideline;

export const UI_TYPE_WEIGHTS = {
  id: 'ui/type-weights',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  // `step`: weights are rounded to this step; `share` as in type-sizes.
  thresholds: { maxWeights: 3, share: 0.02, step: 100, minTextNodes: 3 },
  sources: [],
  screens: null,
  key: 'uiTypeWeights',
} as const satisfies Guideline;

export const UI_HEADING_SCALE = {
  id: 'ui/heading-scale',
  check: 'ui',
  chapter: 'hierarchy',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  // `headingFactor`: text this many times the body size counts as a heading (shared by the type rules).
  thresholds: { minStep: 1.1, topFactor: 1.5, headingFactor: 1.5 },
  sources: [
    NNG_HIERARCHY,
    {
      name: 'Smashing Magazine legibility',
      url: 'https://www.smashingmagazine.com/2020/07/css-techniques-legibility/',
    },
  ],
  screens: null,
  key: 'uiHeadingScale',
} as const satisfies Guideline;

export const UI_CENTERED_TEXT = {
  id: 'ui/centered-text',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  // The principle is Butterick's; the line count is a heuristic.
  thresholds: { minLines: 3 },
  sources: [
    { name: 'Butterick centered text', url: 'https://practicaltypography.com/centered-text.html' },
  ],
  screens: null,
  key: 'uiCenteredText',
} as const satisfies Guideline;

export const UI_JUSTIFIED_TEXT = {
  id: 'ui/justified-text',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { minLines: 2 },
  sources: [WCAG_VISUAL],
  screens: null,
  key: 'uiJustifiedText',
} as const satisfies Guideline;

export const UI_TYPE_GUIDELINES: readonly Guideline[] = [
  UI_LINE_LENGTH,
  UI_LINE_HEIGHT,
  UI_HEADING_LINE_HEIGHT,
  UI_TEXT_SIZE,
  UI_TYPE_SIZES,
  UI_TYPE_WEIGHTS,
  UI_HEADING_SCALE,
  UI_CENTERED_TEXT,
  UI_JUSTIFIED_TEXT,
];
