// The version timeline (spec 4d, goal 5; plan 17): where one element was in each version, and
// bringing it back from an older one as a diff to accept.

import { EditOpSchema, ELEMENT_ID } from '../../../edit/index.ts';
import { z } from '../../../shared/index.ts';

const Element = z.string().max(200).regex(ELEMENT_ID);

/** One version on the strip, for the element asked about. */
export const ElementStepSchema = z.strictObject({
  version: z.number().int().min(1),
  /** The element's id in that version; `null` when it did not exist there. */
  id: Element.nullable(),
  /** Its source differs from the version before (whitespace collapsed). */
  changed: z.boolean(),
  /** The way back to this version went through a best-effort match (ADR 0052). */
  unsure: z.boolean(),
});

/** GET `/api/v1/drafts/{slug}/history?id=<element id in the latest version>`. */
export const ElementHistorySchema = z.strictObject({
  id: Element,
  /** Oldest first, the latest version last. */
  steps: z.array(ElementStepSchema),
});

/** POST `/api/v1/drafts/{slug}/restore`: the element (latest id) and the version to take it from. */
export const RestoreRequestSchema = z.strictObject({
  id: Element,
  version: z.number().int().min(1),
});

/**
 * The answer: the old and the current source for the diff, and whether it can be written. `ops`:
 * the edits to send to POST `…/edits` when the person accepts (the element's `replaceElement` and
 * the kit imports it needs); `null` when `missing` names something the current file lacks.
 */
export const RestorePreviewSchema = z.strictObject({
  file: z.string(),
  old: z.string(),
  current: z.string(),
  /** Identifiers and props the old source uses that the current file or component does not have. */
  missing: z.array(z.string().max(120)),
  /** Kit components the restore imports. */
  imports: z.array(z.string().max(80)),
  ops: z.array(EditOpSchema).nullable(),
});
