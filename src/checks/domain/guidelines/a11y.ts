// Guideline entries: a11y.

import type { Guideline } from './types.ts';

const WCAG = 'https://www.w3.org/WAI/WCAG22/Understanding';

export const A11Y_REFLOW = {
  id: 'a11y/reflow',
  check: 'a11y',
  chapter: 'layout',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  // `reflowWidth` is the WCAG width in CSS px; `tolerance` is the px a scroll width may exceed a
  // width before it counts; `cap` is the most elements reported per visit.
  thresholds: { reflowWidth: 320, tolerance: 1, cap: 5 },
  sources: [{ name: 'WCAG 1.4.10 Reflow', url: `${WCAG}/reflow.html` }],
  screens: null,
  key: 'a11yReflow',
} as const satisfies Guideline;

export const A11Y_TEXT_SPACING = {
  id: 'a11y/text-spacing',
  check: 'a11y',
  chapter: 'layout',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [{ name: 'WCAG 1.4.12 Text Spacing', url: `${WCAG}/text-spacing.html` }],
  screens: null,
  key: 'a11yTextSpacing',
} as const satisfies Guideline;

export const A11Y_FOCUS_VISIBLE = {
  id: 'a11y/focus-visible',
  check: 'a11y',
  chapter: 'focus',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [{ name: 'WCAG 2.4.7 Focus Visible', url: `${WCAG}/focus-visible.html` }],
  screens: null,
  key: 'a11yFocusVisible',
} as const satisfies Guideline;

export const A11Y_FOCUS_HIDDEN = {
  id: 'a11y/focus-hidden',
  check: 'a11y',
  chapter: 'focus',
  mode: 'auto',
  severity: 'mixed',
  basis: 'source',
  thresholds: {},
  sources: [
    {
      name: 'WCAG 2.4.11 Focus Not Obscured (Minimum)',
      url: `${WCAG}/focus-not-obscured-minimum.html`,
    },
  ],
  screens: null,
  key: 'a11yFocusHidden',
} as const satisfies Guideline;

export const A11Y_FOCUS_ORDER = {
  id: 'a11y/focus-order',
  check: 'a11y',
  chapter: 'focus',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  // `backLines`: how many lines of text a stop must sit above the previous stop to count as
  // clearly above.
  thresholds: { backLines: 0.5 },
  sources: [],
  screens: null,
  key: 'a11yFocusOrder',
} as const satisfies Guideline;

export const A11Y_CONTROL_CONTRAST = {
  id: 'a11y/control-contrast',
  check: 'a11y',
  chapter: 'contrast',
  mode: 'auto',
  severity: 'mixed',
  basis: 'source',
  thresholds: { ratio: 3 },
  sources: [
    { name: 'WCAG 1.4.11 Non-text Contrast', url: `${WCAG}/non-text-contrast.html` },
    {
      name: 'WebAIM: Contrast and Color Accessibility',
      url: 'https://webaim.org/articles/contrast/',
    },
  ],
  screens: null,
  key: 'a11yControlContrast',
} as const satisfies Guideline;

export const A11Y_ICON_CONTRAST = {
  id: 'a11y/icon-contrast',
  check: 'a11y',
  chapter: 'contrast',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { ratio: 3 },
  sources: [{ name: 'WCAG 1.4.11 Non-text Contrast', url: `${WCAG}/non-text-contrast.html` }],
  screens: null,
  key: 'a11yIconContrast',
} as const satisfies Guideline;

export const A11Y_FOCUS_CONTRAST = {
  id: 'a11y/focus-contrast',
  check: 'a11y',
  chapter: 'contrast',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: { ratio: 3 },
  sources: [{ name: 'WCAG 1.4.11 Non-text Contrast', url: `${WCAG}/non-text-contrast.html` }],
  screens: null,
  key: 'a11yFocusContrast',
} as const satisfies Guideline;

export const A11Y_CONTRAST_UNSURE = {
  id: 'a11y/contrast-unsure',
  check: 'a11y',
  chapter: 'contrast',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [{ name: 'WCAG 1.4.3 Contrast (Minimum)', url: `${WCAG}/contrast-minimum.html` }],
  screens: null,
  key: 'a11yContrastUnsure',
} as const satisfies Guideline;

export const A11Y_STATE_CONTRAST = {
  id: 'a11y/state-contrast',
  check: 'a11y',
  chapter: 'contrast',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  // `ratio` is the minimum for text, `large` for large text.
  thresholds: { ratio: 4.5, large: 3 },
  sources: [
    { name: 'WCAG 1.4.3 Contrast (Minimum)', url: `${WCAG}/contrast-minimum.html` },
    { name: 'WCAG 1.4.11 Non-text Contrast', url: `${WCAG}/non-text-contrast.html` },
  ],
  screens: null,
  key: 'a11yStateContrast',
} as const satisfies Guideline;

export const A11Y_ERROR_TEXT = {
  id: 'a11y/error-text',
  check: 'a11y',
  chapter: 'errors',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [{ name: 'WCAG 3.3.1 Error Identification', url: `${WCAG}/error-identification.html` }],
  screens: null,
  key: 'a11yErrorText',
} as const satisfies Guideline;

export const A11Y_AUTOCOMPLETE = {
  id: 'a11y/autocomplete',
  check: 'a11y',
  chapter: 'input',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [
    { name: 'WCAG 1.3.5 Identify Input Purpose', url: `${WCAG}/identify-input-purpose.html` },
  ],
  screens: null,
  key: 'a11yAutocomplete',
} as const satisfies Guideline;

/** Words in a field's name or label that mark it as about the user (kitvas's own list). */
export const AUTOCOMPLETE_WORDS: readonly string[] = [
  'name',
  'first',
  'last',
  'email',
  'phone',
  'tel',
  'address',
  'street',
  'city',
  'postal',
  'zip',
  'country',
  'card',
  'username',
  'password',
];

/** Input types that are about the user whatever the name says. */
export const AUTOCOMPLETE_TYPES: readonly string[] = ['email', 'tel', 'password'];

export const A11Y_GUIDELINES: readonly Guideline[] = [
  A11Y_REFLOW,
  A11Y_TEXT_SPACING,
  A11Y_FOCUS_VISIBLE,
  A11Y_FOCUS_HIDDEN,
  A11Y_FOCUS_ORDER,
  A11Y_CONTROL_CONTRAST,
  A11Y_ICON_CONTRAST,
  A11Y_FOCUS_CONTRAST,
  A11Y_CONTRAST_UNSURE,
  A11Y_STATE_CONTRAST,
  A11Y_ERROR_TEXT,
  A11Y_AUTOCOMPLETE,
];
