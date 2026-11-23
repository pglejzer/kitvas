// Guideline entries: the craft rules (icons and logos on a craft board, ADR 0045). Their rules are
// `rules/craft.ts`; the `craft` pass (`adapters/playwright-craft.ts`) measures what they read.

import type { Guideline } from './types.ts';

export const UI_ICON_GRID = {
  id: 'ui/icon-grid',
  check: 'ui',
  chapter: 'look',
  mode: 'auto',
  severity: 'fix',
  basis: 'heuristic',
  // The sketch's viewBox against the one most of the kit's icons on the board use.
  thresholds: {},
  sources: [],
  screens: null,
  key: 'uiIconGrid',
} as const satisfies Guideline;

export const UI_ICON_STROKE = {
  id: 'ui/icon-stroke',
  check: 'ui',
  chapter: 'look',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  // In viewBox units, on each side of the kit's thinnest and thickest stroke. A sketch with no
  // stroke counts as 0 against a stroked kit; a kit with no strokes is not compared.
  thresholds: { tolerance: 0.25 },
  sources: [],
  screens: null,
  key: 'uiIconStroke',
} as const satisfies Guideline;

export const UI_ICON_COLOUR = {
  id: 'ui/icon-colour',
  check: 'ui',
  chapter: 'look',
  mode: 'auto',
  severity: 'fix',
  basis: 'heuristic',
  // A fill or stroke that stays the same whatever colour the icon is given.
  thresholds: {},
  sources: [],
  screens: null,
  key: 'uiIconColour',
} as const satisfies Guideline;

export const UI_ICON_SMALL = {
  id: 'ui/icon-small',
  check: 'ui',
  chapter: 'media',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  // The thinnest painted line of the sketch drawn at 16 px, in device pixels.
  thresholds: { minPx: 1 },
  sources: [],
  screens: null,
  key: 'uiIconSmall',
} as const satisfies Guideline;

export const UI_LOGO_MONO = {
  id: 'ui/logo-mono',
  check: 'ui',
  chapter: 'look',
  mode: 'auto',
  severity: 'fix',
  basis: 'heuristic',
  // A variant marked `data-craft-tone="mono"` whose every svg paints one colour.
  thresholds: {},
  sources: [],
  screens: null,
  key: 'uiLogoMono',
} as const satisfies Guideline;

export const UI_LOGO_SMALL = {
  id: 'ui/logo-small',
  check: 'ui',
  chapter: 'media',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  // The thinnest painted line of the logo drawn at 32 px, in device pixels.
  thresholds: { minPx: 1 },
  sources: [],
  screens: null,
  key: 'uiLogoSmall',
} as const satisfies Guideline;

export const UI_LOGO_CONTRAST = {
  id: 'ui/logo-contrast',
  check: 'ui',
  chapter: 'contrast',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  // The lowest ratio of the logo's colours on the board's light and on its dark ground, the best
  // tone counting on each: a graphic needed to understand the content keeps 3:1, not rounded.
  thresholds: { min: 3 },
  sources: [
    {
      name: 'WCAG 2.2 Understanding 1.4.11 Non-text Contrast',
      url: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html',
    },
    {
      name: 'WebAIM: Contrast and Color Accessibility',
      url: 'https://webaim.org/articles/contrast/',
    },
  ],
  screens: null,
  key: 'uiLogoContrast',
} as const satisfies Guideline;

export const CRAFT_GUIDELINES: readonly Guideline[] = [
  UI_ICON_GRID,
  UI_ICON_STROKE,
  UI_ICON_COLOUR,
  UI_ICON_SMALL,
  UI_LOGO_MONO,
  UI_LOGO_SMALL,
  UI_LOGO_CONTRAST,
];
