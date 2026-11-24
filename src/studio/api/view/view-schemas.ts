// Locked and hidden elements (spec 4d, goal 4; plan 17): the shapes of the view routes. The file is
// `<draft>/view.json` (`src/drafts/domain/view.ts`).

import { MAX_VIEW_IDS, ViewElementSchema } from '../../../drafts/index.ts';
import { z } from '../../../shared/index.ts';

/**
 * GET `/api/v1/drafts/{slug}/view`, ids as they are in the latest version. `changed`: locked ids
 * whose source another writer changed since they were locked (`edit/locked-changed`). `lost`:
 * locks whose element could not be found after another writer's change; the person locks again.
 */
export const ViewSchema = z.strictObject({
  locked: z.array(ViewElementSchema),
  hidden: z.array(ViewElementSchema),
  changed: z.array(ViewElementSchema),
  lost: z.array(ViewElementSchema),
});

/** POST `/api/v1/drafts/{slug}/view`: the whole lists; a new lock keeps the element's text now. */
export const ViewUpdateSchema = z.strictObject({
  locked: z.array(ViewElementSchema).max(MAX_VIEW_IDS),
  hidden: z.array(ViewElementSchema).max(MAX_VIEW_IDS),
});

/** POST `/api/v1/drafts/{slug}/view/restore`: the edit that puts a locked element's text back. */
export const LockRestoreRequestSchema = z.strictObject({ id: ViewElementSchema });
