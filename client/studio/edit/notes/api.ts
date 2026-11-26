// The notes' calls to the studio API (spec 4d, goal 3; plan 17, task C), with the page cookie.
// Every answer is the whole list, as the server checked it before sending; `null` when the call
// did not work (a network error too).

import { isRecord } from '../../../../src/shared/values/guards.ts';
import type { NoteView } from '../../../../src/studio/api/notes/note-schemas.ts';
import { draftPath, call as send } from '../../api/request.ts';

const base = (slug: string): string => `${draftPath(slug)}/notes`;

/** A GET without a body, a POST with one; the answer is a record or `null`. */
async function call(path: string, body?: unknown): Promise<Record<string, unknown> | null> {
  const answer = await send(body === undefined ? 'GET' : 'POST', path, body);
  return answer.ok && isRecord(answer.body) ? answer.body : null;
}

// The list is the server's own schema (`NotesSchema`), checked there before it is sent.
const notesIn = (body: Record<string, unknown> | null): NoteView[] | null =>
  body !== null && Array.isArray(body.notes) ? (body.notes as NoteView[]) : null;

export async function getNotes(slug: string): Promise<NoteView[] | null> {
  return notesIn(await call(base(slug)));
}

export type NewNote = { element: string | null; text: string; for: 'me' | 'claude' };

/** Adds a note; the answer has the new note's id. */
export async function postNote(
  slug: string,
  note: NewNote,
): Promise<{ notes: NoteView[]; created: string } | null> {
  const body = await call(base(slug), note);
  const notes = notesIn(body);
  const created = body?.created;
  return notes !== null && typeof created === 'string' ? { notes, created } : null;
}

export async function changeNote(
  slug: string,
  id: string,
  change: { text?: string; done?: boolean },
): Promise<NoteView[] | null> {
  return notesIn(await call(`${base(slug)}/${encodeURIComponent(id)}`, change));
}

export async function removeNote(slug: string, id: string): Promise<NoteView[] | null> {
  return notesIn(await call(`${base(slug)}/${encodeURIComponent(id)}/delete`, {}));
}
