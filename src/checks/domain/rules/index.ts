// Every rule of the ui, ux and a11y checks, for the browser checks to run.

import { A11Y_RULES } from './a11y.ts';
import type { StatesRule, VisitRule } from './types.ts';
import { UI_LAYOUT_RULES } from './ui-layout.ts';
import { UI_LOOK_RULES } from './ui-look.ts';
import { UI_TYPE_RULES } from './ui-type.ts';
import { UX_FLOW_RULES, UX_FLOW_STATE_RULES } from './ux-flow.ts';
import { UX_FORMS_RULES, UX_FORMS_STATE_RULES } from './ux-forms.ts';

export * from './colour.ts';
export * from './craft.ts';
export { DEEP_RULES } from './deep.ts';
export * from './types.ts';

export const VISIT_RULES: readonly VisitRule[] = [
  ...A11Y_RULES,
  ...UI_TYPE_RULES,
  ...UI_LAYOUT_RULES,
  ...UI_LOOK_RULES,
  ...UX_FORMS_RULES,
  ...UX_FLOW_RULES,
];

export const STATE_RULES: readonly StatesRule[] = [...UX_FORMS_STATE_RULES, ...UX_FLOW_STATE_RULES];

/** The rules the deep widths (768, 1024, 1440) run. */
export const DEEP_WIDTH_RULE_IDS: readonly string[] = [
  'ui/page-overflow',
  'ui/clipped-text',
  'ui/line-length',
  'ui/card-sizes',
];
