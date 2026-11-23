// Guideline entries: the rework rules (`ux/protected`, `ux/before-problems`, `ui/no-viewport`).

import type { Guideline } from './types.ts';

export const UX_PROTECTED = {
  id: 'ux/protected',
  check: 'ux',
  chapter: 'content',
  mode: 'auto',
  severity: 'fix',
  basis: 'heuristic',
  thresholds: {},
  sources: [],
  screens: null,
  key: 'uxProtected',
} as const satisfies Guideline;

export const UX_BEFORE_PROBLEMS = {
  id: 'ux/before-problems',
  check: 'ux',
  chapter: 'content',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: {},
  sources: [],
  screens: null,
  key: 'uxBeforeProblems',
} as const satisfies Guideline;

export const UI_NO_VIEWPORT = {
  id: 'ui/no-viewport',
  check: 'ui',
  chapter: 'layout',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [
    {
      name: 'WCAG 2.2: Reflow (1.4.10)',
      url: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
    },
  ],
  screens: null,
  key: 'uiNoViewport',
} as const satisfies Guideline;

export const REWORK_GUIDELINES: readonly Guideline[] = [
  UX_PROTECTED,
  UX_BEFORE_PROBLEMS,
  UI_NO_VIEWPORT,
];
