// Notes of a draft (spec 4d, goal 3; plan 17, task C): `<draft>/notes.json` read and written, and
// each note's element carried to the latest version through the rename logs, as waivers and locks
// are (`carriedId`). A note whose element is gone keeps its old id, and shows unpinned with that
// place named. The studio is the only writer of the file.

import { KitvasError } from '../../shared/index.ts';
import { serializeJson } from '../domain/draft.ts';
import {
  type DraftNote,
  MAX_NOTES,
  NOTES_FILE,
  type NotesFile,
  NotesFileSchema,
} from '../domain/notes.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { carriedId, renameSteps } from './view.ts';

const emptyNotes = (): NotesFile => ({ schemaVersion: 1, notes: [] });

/** The draft's notes file; an empty one when it is missing or broken. */
export function readNotes(drafts: DraftStore, slug: string): NotesFile {
  let raw: unknown;
  try {
    raw = drafts.readJson(slug, NOTES_FILE);
  } catch {
    // Not JSON: notes only help the person, so a broken file never stops the studio.
    return emptyNotes();
  }
  const parsed = NotesFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyNotes();
}

/** Writes the notes file at once (atomic, as the other draft files). */
export function writeNotes(drafts: DraftStore, slug: string, file: NotesFile): void {
  const kept: NotesFile = { schemaVersion: 1, notes: file.notes.slice(0, MAX_NOTES) };
  drafts.replaceAll(slug, [{ relPath: NOTES_FILE, text: serializeJson(kept) }]);
}

/**
 * Marks a note done or open; the requests code calls it when Claude closes a note's request. A
 * note that is not there any more (the person deleted it) is left alone.
 */
export function setNoteDone(drafts: DraftStore, slug: string, id: string, done: boolean): void {
  const file = readNotes(drafts, slug);
  const note = file.notes.find((one) => one.id === id);
  if (note === undefined || note.done === done) return;
  writeNotes(drafts, slug, {
    ...file,
    notes: file.notes.map((one) => (one.id === id ? { ...one, done } : one)),
  });
}

/** A note with its element's id in the latest version; `null`: gone, or a note on no element. */
export type NoteNow = DraftNote & { current: string | null };

/**
 * The notes, oldest first, each with `current`: its element as version `latest` names it. With
 * `exists`, an element that is not one of the version's is gone (`current: null`).
 */
export function notesNow(
  drafts: DraftStore,
  slug: string,
  latest: number,
  exists?: (id: string) => boolean,
): NoteNow[] {
  const stepsOf = renameSteps(drafts, slug);
  return readNotes(drafts, slug).notes.map((note) => {
    if (note.element === null) return { ...note, current: null };
    const id = carriedId(note.element, note, latest, stepsOf);
    return { ...note, current: exists === undefined || exists(id) ? id : null };
  });
}

/** What a new note holds; `element` as the latest version names it. */
export type NoteInput = Pick<DraftNote, 'id' | 'element' | 'text' | 'for'>;

/** Adds a note made now on version `latest`. Throws `NOTE_LIMIT` when the file is full. */
export function addNote(
  drafts: DraftStore,
  slug: string,
  note: NoteInput,
  latest: number,
  now: Date,
): DraftNote {
  const file = readNotes(drafts, slug);
  if (file.notes.length >= MAX_NOTES) throw new KitvasError('NOTE_LIMIT', { max: MAX_NOTES });
  const made: DraftNote = {
    ...note,
    text: note.text.trim(),
    version: latest,
    at: now.toISOString(),
    done: false,
    request: null,
  };
  writeNotes(drafts, slug, { ...file, notes: [...file.notes, made] });
  return made;
}

function noteIndex(file: NotesFile, slug: string, id: string): number {
  const index = file.notes.findIndex((one) => one.id === id);
  if (index < 0) throw new KitvasError('NOTE_NOT_FOUND', { slug, id });
  return index;
}

/** A new text, done or open. Throws `NOTE_NOT_FOUND` for a note that is not there. */
export function updateNote(
  drafts: DraftStore,
  slug: string,
  id: string,
  change: { text?: string | undefined; done?: boolean | undefined },
): DraftNote {
  const file = readNotes(drafts, slug);
  const index = noteIndex(file, slug, id);
  const before = file.notes[index];
  if (before === undefined) throw new KitvasError('NOTE_NOT_FOUND', { slug, id });
  const next: DraftNote = {
    ...before,
    ...(change.text === undefined ? {} : { text: change.text.trim() }),
    ...(change.done === undefined ? {} : { done: change.done }),
  };
  writeNotes(drafts, slug, {
    ...file,
    notes: file.notes.map((one, at) => (at === index ? next : one)),
  });
  return next;
}

/** Deletes a note. Throws `NOTE_NOT_FOUND` for a note that is not there. */
export function deleteNote(drafts: DraftStore, slug: string, id: string): void {
  const file = readNotes(drafts, slug);
  noteIndex(file, slug, id);
  writeNotes(drafts, slug, { ...file, notes: file.notes.filter((one) => one.id !== id) });
}
