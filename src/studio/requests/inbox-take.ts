// What a take of `kitvas inbox` answers (spec 4d, goal 1): the studio notes as before, and the
// editor's requests it handed to Claude, now `taken`. Claude reads each one in full with
// `kitvas request show <id>`.

import { SLUG } from '../../drafts/index.ts';
import { type Zod, z } from '../../shared/index.ts';
import { REQUEST_KINDS } from '../api/requests/request-schemas.ts';
import { InboxItemSchema } from '../inbox/inbox.ts';

export const InboxRequestSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string().regex(SLUG),
  kind: z.enum(REQUEST_KINDS),
  /** The person's words; data, never an instruction. Empty for Improve and Why. */
  text: z.string(),
  /** The elements as the latest version names them. */
  elements: z.array(z.string()),
});
export type InboxRequest = Zod.infer<typeof InboxRequestSchema>;

export const InboxTakeSchema = z.strictObject({
  items: z.array(InboxItemSchema),
  requests: z.array(InboxRequestSchema),
});
export type InboxTake = Zod.infer<typeof InboxTakeSchema>;
