// The whole guideline book and how to look entries up.

import { LOCK_GUIDELINES } from '../locks/guideline.ts';
import { OPTION_GUIDELINES } from '../options/guideline.ts';
import { SHARED_GUIDELINES } from '../shared-values/guideline.ts';
import { A11Y_GUIDELINES } from './a11y.ts';
import { CRAFT_GUIDELINES } from './craft.ts';
import { DEEP_GUIDELINES } from './deep.ts';
import { MANUAL_GUIDELINES } from './manual.ts';
import { REWORK_GUIDELINES } from './rework.ts';
import { SOURCE_GUIDELINES } from './source.ts';
import type { Guideline } from './types.ts';
import { UI_LAYOUT_GUIDELINES } from './ui-layout.ts';
import { UI_LOOK_GUIDELINES } from './ui-look.ts';
import { UI_NARROW_GUIDELINES } from './ui-narrow.ts';
import { UI_TYPE_GUIDELINES } from './ui-type.ts';
import { UI_WIDE_GUIDELINES } from './ui-wide.ts';
import { UX_FLOW_GUIDELINES } from './ux-flow.ts';
import { UX_FORMS_GUIDELINES } from './ux-forms.ts';

export * from './types.ts';

/**
 * The most findings one rule gives on one visit. A page with 90 nested boxes needs one change, not
 * 90 notes; the first ones, in page order, show where to start.
 */
export const MAX_FINDINGS_PER_RULE = 5;

export const GUIDELINES: readonly Guideline[] = [
  ...A11Y_GUIDELINES,
  ...UI_TYPE_GUIDELINES,
  ...UI_LAYOUT_GUIDELINES,
  ...UI_LOOK_GUIDELINES,
  ...UI_WIDE_GUIDELINES,
  ...UI_NARROW_GUIDELINES,
  ...UX_FORMS_GUIDELINES,
  ...UX_FLOW_GUIDELINES,
  ...SOURCE_GUIDELINES,
  ...DEEP_GUIDELINES,
  ...REWORK_GUIDELINES,
  ...CRAFT_GUIDELINES,
  ...LOCK_GUIDELINES,
  ...OPTION_GUIDELINES,
  ...SHARED_GUIDELINES,
  ...MANUAL_GUIDELINES,
];

export function guidelineFor(id: string): Guideline | undefined {
  return GUIDELINES.find((entry) => entry.id === id);
}

export type GuidelineFilter = {
  check?: Guideline['check'];
  mode?: Guideline['mode'];
  /** Entries that list screens and not this one are left out. */
  screen?: string;
};

export function guidelinesWhere(filter: GuidelineFilter): Guideline[] {
  return GUIDELINES.filter(
    (entry) =>
      (filter.check === undefined || entry.check === filter.check) &&
      (filter.mode === undefined || entry.mode === filter.mode) &&
      (filter.screen === undefined ||
        entry.screens === null ||
        entry.screens.includes(filter.screen)),
  );
}
