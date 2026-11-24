// The Changes rail (plan 18, task D): which step has its own undo, where the rail ends, and what
// the foot says.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  footNote,
  isFresh,
  savedVersion,
  undoableIndex,
} from '../../../../../client/studio/edit/history/rail.ts';
import type { ChangeEntry, Gesture } from '../../../../../client/studio/edit/store.ts';

const line = (label: string, by: ChangeEntry['by'] = 'person'): ChangeEntry => ({
  by,
  id: 'sections/Hero:section',
  label,
  files: [],
  offKit: false,
  at: 1_000,
});
const gesture = (label: string): Gesture => ({ ops: [], label });

test('the newest step has its own undo when it is the top of the undo stack', () => {
  assert.equal(undoableIndex([line('Set gap'), line('Set size')], gesture('Set gap')), 0);
});

test("no step has its own undo: an empty stack, another top, or Claude's step", () => {
  assert.equal(undoableIndex([], gesture('Set gap')), -1);
  assert.equal(undoableIndex([line('Set gap')], undefined), -1);
  assert.equal(undoableIndex([line('Undo: Set gap')], gesture('Set size')), -1);
  assert.equal(undoableIndex([line('Set gap', 'claude')], gesture('Set gap')), -1);
});

test('the rail ends at the last saved version: the one before an open session', () => {
  assert.equal(savedVersion(null), null);
  assert.equal(savedVersion({ version: 3, session: null }), 3);
  assert.equal(savedVersion({ version: 4, session: { version: 4, startedAt: 'now' } }), 3);
  // The first version's session has no saved version before it.
  assert.equal(savedVersion({ version: 1, session: { version: 1, startedAt: 'now' } }), null);
});

test('the foot counts the steps not in a version yet, while a session is open', () => {
  assert.equal(footNote([], true), null);
  assert.equal(footNote([gesture('a')], false), null);
  assert.deepEqual(footNote([gesture('a')], true), {
    key: 'changes.unsavedOne',
    params: { count: 1 },
  });
  assert.deepEqual(footNote([gesture('a'), gesture('b')], true), {
    key: 'changes.unsaved',
    params: { count: 2 },
  });
});

test('a step is fresh only when it came after the rail was last drawn', () => {
  assert.equal(isFresh(2, 3), true);
  assert.equal(isFresh(3, 3), false);
});
