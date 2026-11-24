// The rules of the notes (spec 4d, goal 3; plan 17, task C), pure so they are tested without a
// DOM: the order of the list and its numbers, the pins the cards get, the place a note names,
// and the `note` request a note for Claude sends. A note is the person's: it never reaches a
// build or a draft file, and its text goes to Claude only as the data of a request.

import type { StyleContext } from '../../../../src/edit/index.ts';
import type { NoteView } from '../../../../src/studio/api/notes/note-schemas.ts';
import type {
  NewRequest,
  RequestView,
} from '../../../../src/studio/api/requests/request-schemas.ts';
import type { NotePin } from '../../../channel/live-protocol.ts';
import { MAX_REQUEST_TEXT } from '../ai/requests.ts';
import { elementName } from '../history/changes.ts';

/** Copy of `MAX_NOTE_TEXT` (src/drafts/domain/notes.ts): the client imports no server value. */
export const MAX_NOTE_TEXT = 2_000;

/** The page event "Note…" of the context menu sends: `detail.id` is the element, or `null`. */
export const NOTE_EVENT = 'edit-note';

/** One line of the Notes list. */
export type NoteRow = {
  note: NoteView;
  /** As the pin shows it: `N1`, `N2`… in list order. */
  label: string;
  /** Open, and its element is in the latest version: the cards show its pin. */
  pinned: boolean;
  /**
   * Where the note is: the element's name now, or its old place when the element is gone
   * (`gone`); `null` for a note on the draft as a whole.
   */
  place: { name: string; gone: boolean } | null;
};

/** Open notes first, then the done ones; each group oldest first, as the file keeps them. */
export function orderNotes(notes: readonly NoteView[]): NoteView[] {
  return [...notes.filter((note) => !note.done), ...notes.filter((note) => note.done)];
}

/** How many notes are open: the count the bar's Notes button shows (hidden at none). */
export function openCount(notes: readonly NoteView[]): number {
  return notes.filter((note) => !note.done).length;
}

export function noteRows(notes: readonly NoteView[]): NoteRow[] {
  return orderNotes(notes).map((note, index): NoteRow => {
    const label = `N${index + 1}`;
    if (note.element === null) return { note, label, pinned: false, place: null };
    const gone = note.current === null;
    const name = elementName(note.current ?? note.element);
    return { note, label, pinned: !note.done && !gone, place: { name, gone } };
  });
}

/** The pins every card gets: one per pinned note, on its element as the latest version names it. */
export function pinsOf(rows: readonly NoteRow[]): NotePin[] {
  return rows.flatMap((row): NotePin[] =>
    row.pinned && row.note.current !== null ? [{ id: row.note.current, label: row.label }] : [],
  );
}

/** The note a pin or a selection points at: the first open one on that element. */
export function rowOn(rows: readonly NoteRow[], id: string): NoteRow | undefined {
  return rows.find((row) => row.pinned && row.note.current === id);
}

/**
 * The `note` request of a note for Claude (spec 4d, goal 3): its element, the edit context it was
 * written in, its text (cut to what a request takes) and the note's id, so closing the request
 * marks the note done.
 */
export function noteRequest(
  note: Pick<NoteView, 'id' | 'element' | 'text'>,
  context: StyleContext,
): NewRequest {
  return {
    kind: 'note',
    elements: note.element === null ? [] : [note.element],
    context: { width: context.width, state: context.state },
    text: note.text.trim().slice(0, MAX_REQUEST_TEXT).trim(),
    note: note.id,
  };
}

/** The request a note sent that still waits: dropped when the note is deleted or done. */
export function waitingRequest(
  requests: readonly RequestView[],
  noteId: string,
): RequestView | undefined {
  return requests.find((request) => request.note === noteId && request.status === 'waiting');
}

/** The status of each request that carries a note, to tell when one moved (Claude closed it). */
export function noteRequestKey(requests: readonly RequestView[]): string {
  return requests
    .filter((request) => request.note !== null)
    .map((request) => `${request.id}:${request.status}`)
    .join(' ');
}

/** The text a note form sends; `null` while it is empty. */
export function noteText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, MAX_NOTE_TEXT);
}
