// Notes pinned to elements (spec 4d, goal 3; plan 17). They live in `<draft>/notes.json`, beside
// `draft.json`, and follow their element to later versions through the rename log (ADR 0052), as
// waivers do. A note whose element is gone keeps its old id and shows unpinned. Pure: no files
// here; `app/notes.ts` reads and writes them.

import { type Zod, z } from '../../shared/index.ts';

export const NOTES_FILE = 'notes.json';
export const MAX_NOTE_TEXT = 2_000;
export const MAX_NOTES = 500;

/** Copy of `ELEMENT_ID` in `src/edit/domain/ops.ts`: this module cannot import the edit module. */
const ELEMENT = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*:[A-Za-z0-9_.$-]+(?:\/[A-Za-z0-9_.$-]+)*$/;

export const NOTE_FOR = ['me', 'claude'] as const;

export const DraftNoteSchema = z.strictObject({
  id: z.uuid(),
  /** The element as it was named on `version`; `null` for a note on the whole draft. */
  element: z.string().max(200).regex(ELEMENT).nullable(),
  text: z.string().trim().min(1).max(MAX_NOTE_TEXT),
  for: z.enum(NOTE_FOR),
  /** The version it was made or last moved on. */
  version: z.number().int().min(1),
  /** ISO date and time. */
  at: z.string().min(1).max(40),
  done: z.boolean(),
  /** The request a note for Claude made (goal 1); closing it marks the note done. */
  request: z.uuid().nullable(),
});
export type DraftNote = Zod.infer<typeof DraftNoteSchema>;

export const NotesFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  notes: z.array(DraftNoteSchema).max(MAX_NOTES),
});
export type NotesFile = Zod.infer<typeof NotesFileSchema>;
