import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_NOTE_TEXT,
  noteRequest,
  noteRequestKey,
  noteRows,
  noteText,
  orderNotes,
  pinsOf,
  rowOn,
  waitingRequest,
} from '../../../../../client/studio/edit/notes/model.ts';
import { MAX_NOTE_TEXT as SERVER_MAX } from '../../../../../src/drafts/index.ts';
import type { NoteView } from '../../../../../src/studio/api/notes/note-schemas.ts';
import type { RequestView } from '../../../../../src/studio/api/requests/request-schemas.ts';

const BUTTON = 'sections/Hero:section/Button';
const TITLE = 'sections/Hero:section/Text';

const note = (id: string, over: Partial<NoteView> = {}): NoteView => ({
  id,
  element: BUTTON,
  text: 'Bigger',
  for: 'me',
  version: 1,
  at: '2026-11-24T10:00:00.000Z',
  done: false,
  request: null,
  current: BUTTON,
  ...over,
});

test('the client keeps the same note length as the server', () => {
  assert.equal(MAX_NOTE_TEXT, SERVER_MAX);
});

test('open notes come first, done ones after, each in the order they were made', () => {
  const list = [note('a', { done: true }), note('b'), note('c', { done: true }), note('d')];
  assert.deepEqual(
    orderNotes(list).map((one) => one.id),
    ['b', 'd', 'a', 'c'],
  );
});

test('rows are numbered as in the list; only open notes on an element now are pinned', () => {
  const rows = noteRows([
    note('done', { done: true }),
    note('pinned'),
    note('gone', { current: null }),
    note('draft', { element: null, current: null }),
    note('title', { element: TITLE, current: TITLE }),
  ]);
  assert.deepEqual(
    rows.map((row) => [row.note.id, row.label, row.pinned]),
    [
      ['pinned', 'N1', true],
      ['gone', 'N2', false],
      ['draft', 'N3', false],
      ['title', 'N4', true],
      ['done', 'N5', false],
    ],
  );
  // An unpinned note names its old place; a note on the draft names none.
  assert.deepEqual(rows[1]?.place, { name: 'Hero / Button', gone: true });
  assert.equal(rows[2]?.place, null);
  assert.deepEqual(pinsOf(rows), [
    { id: BUTTON, label: 'N1' },
    { id: TITLE, label: 'N4' },
  ]);
  assert.equal(rowOn(rows, TITLE)?.label, 'N4');
  assert.equal(rowOn(rows, 'sections/Hero:section'), undefined);
});

test('a note for Claude sends a note request with its element, context and id', () => {
  const made = noteRequest(
    { id: 'n1', element: BUTTON, text: `  ${'x'.repeat(1_200)}  ` },
    { width: 390, state: 'hover' },
  );
  assert.equal(made.kind, 'note');
  assert.deepEqual(made.elements, [BUTTON]);
  assert.deepEqual(made.context, { width: 390, state: 'hover' });
  assert.equal(made.note, 'n1');
  // A request takes less text than a note: the words are cut to fit.
  assert.equal(made.text.length, 1_000);
  assert.deepEqual(
    noteRequest({ id: 'n2', element: null, text: 'Hi' }, { width: null, state: null }).elements,
    [],
  );
});

test("a note's waiting request is found, and a status change of one tells the notes to reload", () => {
  const request = (id: string, status: RequestView['status'], noteId: string | null) =>
    ({ id, status, note: noteId }) as RequestView;
  const before = [request('r1', 'waiting', 'n1'), request('r2', 'waiting', null)];
  assert.equal(waitingRequest(before, 'n1')?.id, 'r1');
  assert.equal(waitingRequest([request('r1', 'taken', 'n1')], 'n1'), undefined);
  const after = [request('r1', 'answered', 'n1'), request('r2', 'taken', null)];
  assert.notEqual(noteRequestKey(before), noteRequestKey(after));
  // A request without a note does not count.
  assert.equal(
    noteRequestKey([request('r1', 'waiting', 'n1'), request('r2', 'taken', null)]),
    noteRequestKey(before),
  );
});

test('an empty note is not sent, and a long one is cut to the limit', () => {
  assert.equal(noteText('   '), null);
  assert.equal(noteText('  Fine  '), 'Fine');
  assert.equal(noteText('y'.repeat(MAX_NOTE_TEXT + 5))?.length, MAX_NOTE_TEXT);
});
