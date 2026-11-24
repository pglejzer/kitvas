import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addNote,
  addVersion,
  appendRenames,
  deleteNote,
  MAX_NOTES,
  notesNow,
  readNotes,
  setNoteDone,
  updateNote,
  writeNotes,
} from '../../src/drafts/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { shopDraft } from '../helpers/drafts.ts';

const T1 = new Date('2026-11-24T10:30:00.000Z');
const ID = '0b9b8c6e-4f4a-4c1e-9d55-2f1f7f1c0a01';
const OTHER = '0b9b8c6e-4f4a-4c1e-9d55-2f1f7f1c0a02';
const OLD = 'sections/Hero:section/Button';
const MOVED = 'sections/Hero:section/Stack/Button';

const input = (id = ID, element: string | null = OLD) => ({
  id,
  element,
  text: '  Make it bigger  ',
  for: 'me' as const,
});

test('a draft with no notes file has none, and a broken file none either', () => {
  const { store } = shopDraft();
  assert.deepEqual(readNotes(store, 'shop'), { schemaVersion: 1, notes: [] });
  store.writeText('shop', 'notes.json', '{ nope');
  assert.deepEqual(readNotes(store, 'shop').notes, []);
});

test('a new note keeps its element, text, who it is for, version and moment', () => {
  const { store } = shopDraft();
  const made = addNote(store, 'shop', input(), 1, T1);
  assert.deepEqual(made, {
    id: ID,
    element: OLD,
    text: 'Make it bigger',
    for: 'me',
    version: 1,
    at: T1.toISOString(),
    done: false,
    request: null,
  });
  assert.deepEqual(readNotes(store, 'shop').notes, [made]);
  assert.ok((store.readText('shop', 'notes.json') ?? '').endsWith('}\n'));
});

test('a note changes its text, is marked done and open again, and is deleted', () => {
  const { store } = shopDraft();
  addNote(store, 'shop', input(), 1, T1);
  addNote(store, 'shop', input(OTHER, null), 1, T1);
  assert.equal(updateNote(store, 'shop', ID, { text: ' Smaller ' }).text, 'Smaller');
  assert.equal(updateNote(store, 'shop', ID, { done: true }).done, true);
  setNoteDone(store, 'shop', ID, false);
  assert.equal(readNotes(store, 'shop').notes[0]?.done, false);
  deleteNote(store, 'shop', ID);
  assert.deepEqual(
    readNotes(store, 'shop').notes.map((note) => note.id),
    [OTHER],
  );
});

test('a note that is not there is an error to change or delete, and left alone when closed', () => {
  const { store } = shopDraft();
  const missing = (error: unknown) =>
    error instanceof KitvasError && error.code === 'NOTE_NOT_FOUND';
  assert.throws(() => updateNote(store, 'shop', ID, { done: true }), missing);
  assert.throws(() => deleteNote(store, 'shop', ID), missing);
  // Claude closes the request of a note the person deleted meanwhile: nothing to do.
  setNoteDone(store, 'shop', ID, true);
  assert.equal(store.exists('shop', 'notes.json'), false);
});

test('a full notes file takes no more', () => {
  const { store } = shopDraft();
  const notes = Array.from({ length: MAX_NOTES }, (_, index) => ({
    id: `0b9b8c6e-4f4a-4c1e-9d55-${String(index).padStart(12, '0')}`,
    element: null,
    text: 'x',
    for: 'me' as const,
    version: 1,
    at: T1.toISOString(),
    done: false,
    request: null,
  }));
  writeNotes(store, 'shop', { schemaVersion: 1, notes });
  assert.throws(
    () => addNote(store, 'shop', input(), 1, T1),
    (error) => error instanceof KitvasError && error.code === 'NOTE_LIMIT',
  );
});

test("a note follows its element's renames, and is unpinned when the element is gone", () => {
  const { store } = shopDraft();
  addNote(store, 'shop', input(), 1, T1);
  addNote(store, 'shop', input(OTHER, null), 1, T1);
  const v2 = addVersion(store, 'shop', new Date('2026-11-24T11:00:00.000Z')).version;
  appendRenames(store, 'shop', v2, {
    at: '2026-11-24T12:00:00.000Z',
    renames: { [OLD]: MOVED },
    created: [],
  });
  const now = notesNow(store, 'shop', v2);
  assert.deepEqual(
    now.map((note) => [note.element, note.current]),
    [
      [OLD, MOVED],
      [null, null],
    ],
  );
  // An element the version does not have: the note keeps its old place and has no current one.
  const gone = notesNow(store, 'shop', v2, () => false);
  assert.equal(gone[0]?.current, null);
  assert.equal(gone[0]?.element, OLD);
});
