import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteStatus } from '../../../../../client/studio/edit/notes/model.ts';
import type { NoteView } from '../../../../../src/studio/api/notes/note-schemas.ts';
import type { RequestView } from '../../../../../src/studio/api/requests/request-schemas.ts';

const note = (over: Partial<NoteView> = {}): NoteView => ({
  id: '11111111-1111-4111-8111-111111111111',
  element: 'sections/Plans:section',
  text: 'Make the label shorter on phones.',
  for: 'claude',
  version: 1,
  at: '2026-11-25T10:00:00.000Z',
  done: false,
  request: null,
  current: 'sections/Plans:section',
  ...over,
});

const request = (status: RequestView['status'], noteId: string | null): RequestView => ({
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'note',
  elements: [],
  context: { width: null, state: null },
  text: 'Make the label shorter on phones.',
  version: 1,
  at: '2026-11-25T10:00:00.000Z',
  status,
  note: noteId,
  stale: false,
  answer: null,
});

test('a note for Claude whose request waits says it waits, and one Claude took says working', () => {
  const mine = note();
  assert.equal(noteStatus(mine, [request('waiting', mine.id)]), 'waiting');
  assert.equal(noteStatus(mine, [request('taken', mine.id)]), 'working');
});

test('a done note says done; an open note nothing is asked of has no status', () => {
  assert.equal(noteStatus(note({ done: true }), []), 'done');
  assert.equal(noteStatus(note({ for: 'me' }), []), null);
  assert.equal(noteStatus(note(), []), null);
});

test('a request of another note, or one Claude answered, is not this note’s status', () => {
  const mine = note();
  assert.equal(noteStatus(mine, [request('waiting', 'other')]), null);
  assert.equal(noteStatus(mine, [request('answered', mine.id)]), null);
});
