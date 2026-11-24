// Why this design (spec 4d, goal 7; plan 17): the reasons of each section of the latest version.

import { MAX_WHY_LINE } from '../../../drafts/index.ts';
import { z } from '../../../shared/index.ts';

export const WhySectionSchema = z.strictObject({
  /** The section's component name, as the layout names it. */
  section: z.string().max(64),
  /** The section's root element id, so a click selects it; `null` when the build has none. */
  element: z.string().max(200).nullable(),
  lines: z.array(z.string().max(MAX_WHY_LINE)),
  guidelines: z.array(z.string().max(64)),
  /** The section's source changed since the lines were written. */
  stale: z.boolean(),
});

/** GET `/api/v1/drafts/{slug}/why`. `missing`: sections with no reasons yet. */
export const WhySchema = z.strictObject({
  sections: z.array(WhySectionSchema),
  missing: z.array(z.string().max(64)),
});
