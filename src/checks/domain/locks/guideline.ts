// The guideline entry of the lock rule (spec 4d, goal 4; plan 17, task C): a locked element keeps
// the source it had when the person locked it. `fix`: the person said in so many words that this
// element must not change, so any change to it is plainly not what they asked for.

import type { Guideline } from '../guidelines/types.ts';

export const EDIT_LOCKED_CHANGED = {
  id: 'edit/locked-changed',
  check: 'edit',
  chapter: 'code',
  mode: 'auto',
  severity: 'fix',
  basis: 'heuristic',
  thresholds: {},
  sources: [],
  screens: null,
  key: 'editLockedChanged',
} as const satisfies Guideline;

export const LOCK_GUIDELINES: readonly Guideline[] = [EDIT_LOCKED_CHANGED];
