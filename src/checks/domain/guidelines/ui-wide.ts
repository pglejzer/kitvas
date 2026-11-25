// Guideline entries: ui-wide (what goes wrong on a wide screen, ADR 0073).

import type { Guideline } from './types.ts';

export const UI_UPSCALED_IMAGE = {
  id: 'ui/upscaled-image',
  check: 'ui',
  chapter: 'layout',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { factor: 1.25 },
  sources: [
    {
      name: 'MDN: responsive images',
      url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images',
    },
  ],
  screens: null,
  key: 'uiUpscaledImage',
} as const satisfies Guideline;

export const UI_STRETCHED_FIELD = {
  id: 'ui/stretched-field',
  check: 'ui',
  chapter: 'layout',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { maxWidth: 640, fromPage: 1280 },
  sources: [
    {
      name: 'NN/g: web form design',
      url: 'https://www.nngroup.com/articles/web-form-design/',
    },
  ],
  screens: null,
  key: 'uiStretchedField',
} as const satisfies Guideline;

export const UI_WIDE_GUIDELINES: readonly Guideline[] = [UI_UPSCALED_IMAGE, UI_STRETCHED_FIELD];
