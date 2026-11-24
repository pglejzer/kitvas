// Deleted drafts (ADR 0064): the shapes of the trash routes and of the `drafts` event. The rules are
// in the drafts module (`app/trash.ts`).

import { SLUG } from '../../../drafts/index.ts';
import { type Zod, z } from '../../../shared/index.ts';

/** A deleted draft as the pages and the CLI list it. */
export const DeletedItemSchema = z.strictObject({
  slug: z.string().regex(SLUG),
  title: z.string(),
  /** ISO date and time of the delete. */
  deletedAt: z.string(),
});

export type DeletedItem = Zod.infer<typeof DeletedItemSchema>;

/** GET `/api/v1/trash`: the deleted drafts, newest first. */
export const TrashListSchema = z.strictObject({ items: z.array(DeletedItemSchema) });

/** DELETE `/api/v1/drafts/{slug}`: where the draft is now. */
export const DraftDeletedSchema = z.strictObject({ deleted: DeletedItemSchema });

/** POST `/api/v1/trash/{slug}/restore`. */
export const DraftRestoredSchema = z.strictObject({ restored: DeletedItemSchema });

/** DELETE `/api/v1/trash/{slug}`: what was removed for good. */
export const DraftPurgedSchema = z.strictObject({ purged: z.array(DeletedItemSchema) });

/** The `drafts` event: the set of drafts changed, so an open gallery or draft page looks again. */
export const DraftsEventSchema = z.strictObject({
  slug: z.string().regex(SLUG),
  change: z.enum(['deleted', 'restored', 'purged']),
});

export type DraftsEvent = Zod.infer<typeof DraftsEventSchema>;
