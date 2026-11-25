// Guideline entries: ui-narrow (what goes wrong when a layout squeezes its content, ADR 0074).

import type { Guideline } from './types.ts';

export const UI_WRAPPED_ACTION = {
  id: 'ui/wrapped-action',
  check: 'ui',
  chapter: 'layout',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { maxLines: 1 },
  sources: [
    { name: 'Cimpress UI: button', url: 'https://ui.cimpress.io/components/button' },
    { name: 'USWDS Button', url: 'https://designsystem.digital.gov/components/button/' },
  ],
  screens: null,
  key: 'uiWrappedAction',
} as const satisfies Guideline;

export const UI_NARROW_COLUMN = {
  id: 'ui/narrow-column',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  // A block of at least `minLines` lines whose longest line holds fewer than `minChars` characters.
  thresholds: { minLines: 3, minChars: 25 },
  sources: [
    { name: 'Baymard line length', url: 'https://baymard.com/blog/line-length-readability' },
  ],
  screens: null,
  key: 'uiNarrowColumn',
} as const satisfies Guideline;

export const UI_NARROW_GUIDELINES: readonly Guideline[] = [UI_WRAPPED_ACTION, UI_NARROW_COLUMN];
