// The guideline entries of the two option rules (plan 25, C7). `no-effect` is `review`: a value
// that changes nothing may be a mistake, or a value the person keeps for later. `unknown` is `fix`:
// a selector no page can match is plainly broken.

import type { Guideline } from '../guidelines/types.ts';

export const OPTIONS_NO_EFFECT = {
  id: 'options/no-effect',
  check: 'options',
  chapter: 'states',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: {},
  sources: [],
  screens: null,
  key: 'optionsNoEffect',
} as const satisfies Guideline;

export const OPTIONS_UNKNOWN = {
  id: 'options/unknown',
  check: 'options',
  chapter: 'code',
  mode: 'auto',
  severity: 'fix',
  basis: 'heuristic',
  thresholds: {},
  sources: [],
  screens: null,
  key: 'optionsUnknown',
} as const satisfies Guideline;

export const OPTION_GUIDELINES: readonly Guideline[] = [OPTIONS_NO_EFFECT, OPTIONS_UNKNOWN];
