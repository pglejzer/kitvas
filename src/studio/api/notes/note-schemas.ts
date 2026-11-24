// Notes pinned to elements (spec 4d, goal 3; plan 17): the shapes of the notes routes. The file
// is `<draft>/notes.json` (`src/drafts/domain/notes.ts`).

import { DraftNoteSchema, MAX_NOTE_TEXT, NOTE_FOR } from '../../../drafts/index.ts';
import { ELEMENT_ID } from '../../../edit/index.ts';
import { type Zod, z } from '../../../shared/index.ts';

/** GET `/api/v1/drafts/{slug}/notes`: the notes with their ids as they are in the latest version. */
export const NotesSchema = z.strictObject({
  notes: z.array(
    DraftNoteSchema.extend({
      /** The element's id in the latest version; `null` when it is gone (the note is unpinned). */
      current: z.string().nullable(),
    }),
  ),
});

export type NoteView = Zod.infer<typeof NotesSchema>['notes'][number];

/** POST `/api/v1/drafts/{slug}/notes`. */
export const NewNoteRequestSchema = z.strictObject({
  element: z.string().max(200).regex(ELEMENT_ID).nullable(),
  text: z.string().trim().min(1).max(MAX_NOTE_TEXT),
  for: z.enum(NOTE_FOR),
});

/** POST `/api/v1/drafts/{slug}/notes/{id}`: a new text, done or open. */
export const NoteUpdateSchema = z.strictObject({
  text: z.string().trim().min(1).max(MAX_NOTE_TEXT).optional(),
  done: z.boolean().optional(),
});
