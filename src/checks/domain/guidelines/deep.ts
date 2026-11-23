// Guideline entries of `kitvas check --deep` (spec section 7). Their rules are `rules/deep.ts`; the
// stress passes that measure them run in the browser adapter and read their numbers from here.

import type { Guideline } from './types.ts';

const WIG = {
  name: 'Vercel Web Interface Guidelines',
  url: 'https://github.com/vercel-labs/web-interface-guidelines',
} as const;

export const UI_LONG_TEXT = {
  id: 'ui/long-text',
  check: 'ui',
  chapter: 'layout',
  mode: 'deep',
  severity: 'review',
  basis: 'heuristic',
  // Leaf texts shorter than `shortChars` characters are repeated to `factor` times their length.
  thresholds: { shortChars: 40, factor: 3 },
  sources: [WIG],
  screens: null,
  key: 'uiLongText',
} as const satisfies Guideline;

export const UI_LONG_NUMBER = {
  id: 'ui/long-number',
  check: 'ui',
  chapter: 'layout',
  mode: 'deep',
  severity: 'review',
  basis: 'heuristic',
  // Number-only texts are replaced by LONG_NUMBER (`domain/facts.ts`).
  thresholds: {},
  sources: [WIG],
  screens: null,
  key: 'uiLongNumber',
} as const satisfies Guideline;

export const A11Y_ORIENTATION = {
  id: 'a11y/orientation',
  check: 'a11y',
  chapter: 'layout',
  mode: 'deep',
  severity: 'fix',
  basis: 'source',
  // Held sideways, the page shows less than this share of the characters it shows upright.
  thresholds: { minShare: 0.5 },
  sources: [
    {
      name: 'WCAG 2.2 Understanding 1.3.4 Orientation',
      url: 'https://www.w3.org/WAI/WCAG22/Understanding/orientation.html',
    },
  ],
  screens: null,
  key: 'a11yOrientation',
} as const satisfies Guideline;

export const A11Y_MOTION = {
  id: 'a11y/motion',
  check: 'a11y',
  chapter: 'motion',
  mode: 'deep',
  severity: 'review',
  basis: 'source',
  // Animations that repeat forever and autoplay videos still playing with reduced motion on.
  thresholds: {},
  sources: [
    {
      name: 'WCAG 2.2 Understanding 2.2.2 Pause, Stop, Hide',
      url: 'https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html',
    },
    WIG,
  ],
  screens: null,
  key: 'a11yMotion',
} as const satisfies Guideline;

export const A11Y_CONTRAST_ON_IMAGE = {
  id: 'a11y/contrast-on-image',
  check: 'a11y',
  chapter: 'contrast',
  mode: 'deep',
  severity: 'fix',
  basis: 'source',
  // Ratios for normal and large text; text is large from `largeSize` px, or from `largeBoldSize`
  // px at a weight of `boldWeight` or more.
  thresholds: { normal: 4.5, large: 3, largeSize: 24, largeBoldSize: 18.66, boldWeight: 700 },
  sources: [
    {
      name: 'WCAG 2.2 Understanding 1.4.3 Contrast (Minimum)',
      url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
    },
    {
      name: 'WebAIM: Contrast and Color Accessibility',
      url: 'https://webaim.org/articles/contrast/',
    },
  ],
  screens: null,
  key: 'a11yContrastOnImage',
} as const satisfies Guideline;

export const DEEP_GUIDELINES: readonly Guideline[] = [
  UI_LONG_TEXT,
  UI_LONG_NUMBER,
  A11Y_ORIENTATION,
  A11Y_MOTION,
  A11Y_CONTRAST_ON_IMAGE,
];
