// The guideline entry of the shared-values rule (plan 26, ADR 0086). `fix`: a shared value nobody
// sets or nobody reads is a control that does nothing, or a filter that filters nothing.

import type { Guideline } from '../guidelines/types.ts';

export const UX_SHARED_UNUSED = {
  id: 'ux/shared-unused',
  check: 'ux',
  chapter: 'actions',
  mode: 'auto',
  severity: 'fix',
  basis: 'heuristic',
  thresholds: {},
  sources: [],
  screens: null,
  key: 'uxSharedUnused',
} as const satisfies Guideline;

export const SHARED_GUIDELINES: readonly Guideline[] = [UX_SHARED_UNUSED];
