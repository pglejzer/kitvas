// What the editor keeps of how a person looks at a draft (spec 4d, goal 4; plan 17): locked and
// hidden elements, in `<draft>/view.json`. Both follow their elements to later versions through the
// rename log (ADR 0052). A lock keeps the element's source text as it was when it was locked, as
// written, so Restore gives it back byte for byte; a change by another writer (Claude, another
// editor) is found by comparing the texts with whitespace collapsed (`collapseSource`). Hide stays a preview in the frame. Pure: `app/view.ts` reads and writes the file.

import { type Zod, z } from '../../shared/index.ts';

export const VIEW_FILE = 'view.json';
export const MAX_VIEW_IDS = 500;
/** The longest element source a lock keeps; a larger element cannot be locked. */
export const MAX_LOCK_TEXT = 20_000;

/** Copy of `ELEMENT_ID` in `src/edit/domain/ops.ts`: this module cannot import the edit module. */
const ELEMENT = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*:[A-Za-z0-9_.$-]+(?:\/[A-Za-z0-9_.$-]+)*$/;
export const ViewElementSchema = z.string().max(200).regex(ELEMENT);

export const LockSchema = z.strictObject({
  id: ViewElementSchema,
  /** The file of the element, inside the version (`src/tsx/sections/Hero.tsx`). */
  file: z.string().min(1).max(300),
  /** The element's source when it was locked, as written; compared through `collapseSource`. */
  text: z.string().max(MAX_LOCK_TEXT),
  /** The version the id and the text belong to. */
  version: z.number().int().min(1),
  at: z.string().min(1).max(40),
});
export type Lock = Zod.infer<typeof LockSchema>;

export const ViewFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  locked: z.array(LockSchema).max(MAX_VIEW_IDS),
  hidden: z.array(ViewElementSchema).max(MAX_VIEW_IDS),
  /** The version the hidden ids belong to. */
  version: z.number().int().min(1),
});
export type ViewFile = Zod.infer<typeof ViewFileSchema>;

/** Source text as a lock compares it: runs of whitespace are one space, ends trimmed. */
export function collapseSource(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
