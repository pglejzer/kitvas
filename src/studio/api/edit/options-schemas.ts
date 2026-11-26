// The shape of "Make default" (plan 25): the version the editor shows and the values to make the
// defaults. The answer is an edit's own outcome (`EditOutcomeSchema`), so Undo sends its inverse
// through the edits route like every other step.

import { MAX_OPTIONS, OPTION_ID, OPTION_VALUE, type Zod, z } from '../../../shared/index.ts';

/** `POST /api/v1/drafts/{slug}/options/default`. */
export const OptionsDefaultRequestSchema = z.strictObject({
  /** The version the editor shows; it must be the latest. */
  version: z.number().int().min(1),
  /** Option id to value id: the values that become the defaults. */
  choice: z
    .record(z.string().regex(OPTION_ID), z.string().regex(OPTION_VALUE))
    .refine((choice) => Object.keys(choice).length <= MAX_OPTIONS),
});

export type OptionsDefaultRequest = Zod.infer<typeof OptionsDefaultRequestSchema>;
