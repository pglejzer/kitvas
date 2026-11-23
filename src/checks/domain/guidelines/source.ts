// Guideline entries for the rules that read the draft's sources (ADR 0043).

import type { Guideline } from './types.ts';

const WIG = {
  name: 'Vercel Web Interface Guidelines',
  url: 'https://github.com/vercel-labs/web-interface-guidelines',
} as const;

export const UX_PASTE_BLOCKED = {
  id: 'ux/paste-blocked',
  check: 'ux',
  chapter: 'code',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [
    {
      name: 'WCAG 3.3.8 Accessible Authentication',
      url: 'https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html',
    },
    WIG,
  ],
  screens: null,
  key: 'uxPasteBlocked',
} as const satisfies Guideline;

export const UX_AUTOFOCUS = {
  id: 'ux/autofocus',
  check: 'ux',
  chapter: 'code',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [WIG],
  screens: null,
  key: 'uxAutofocus',
} as const satisfies Guideline;

export const UI_TRANSITION_ALL = {
  id: 'ui/transition-all',
  check: 'ui',
  chapter: 'code',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [WIG],
  screens: null,
  key: 'uiTransitionAll',
} as const satisfies Guideline;

export const UI_IMAGE_SIZE = {
  id: 'ui/image-size',
  check: 'ui',
  chapter: 'code',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [{ name: 'web.dev: optimize CLS', url: 'https://web.dev/articles/optimize-cls' }, WIG],
  screens: null,
  key: 'uiImageSize',
} as const satisfies Guideline;

export const SOURCE_GUIDELINES: readonly Guideline[] = [
  UX_PASTE_BLOCKED,
  UX_AUTOFOCUS,
  UI_TRANSITION_ALL,
  UI_IMAGE_SIZE,
];
