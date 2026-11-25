// Shapes of "Undo save" (plan 15, task D): the editor reopens the session it just ended. The
// route is in `edit-routes.ts`; the rule is `reopenEditSession` in the drafts module.

import { type Zod, z } from '../../../shared/index.ts';

const Version = z.number().int().min(1);

/** `POST /api/v1/drafts/{slug}/edits/reopen`: the session as `GET …/edits` told it. */
export const SessionReopenRequestSchema = z.strictObject({
  version: Version,
  startedAt: z.string().min(1),
});

/** The answer when the session is open again; anything else is `EDIT_SESSION_TAKEN` (409). */
export const SessionReopenSchema = z.strictObject({ version: Version, reopened: z.literal(true) });

export type SessionReopen = Zod.infer<typeof SessionReopenSchema>;
