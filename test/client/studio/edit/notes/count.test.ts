import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openCount } from '../../../../../client/studio/edit/notes/model.ts';
import type { NoteView } from '../../../../../src/studio/api/notes/note-schemas.ts';

const note = (id: string, over: Partial<NoteView> = {}): NoteView => ({
  id,
  element: 'sections/Hero:section/Button',
  text: 'Bigger',
  for: 'me',
  version: 1,
  at: '2026-11-24T10:00:00.000Z',
  done: false,
  request: null,
  current: 'sections/Hero:section/Button',
  ...over,
});

test('the bar counts the open notes and leaves the done ones out', () => {
  assert.equal(openCount([]), 0);
  assert.equal(openCount([note('a'), note('b', { done: true }), note('c')]), 2);
  assert.equal(openCount([note('a', { done: true })]), 0);
});

test('a note whose element is gone still counts while it is open', () => {
  assert.equal(openCount([note('a', { current: null })]), 1);
});
