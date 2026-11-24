import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  disabledButtons,
  type KeptSession,
  offKitSteps,
  reopenOutcome,
  sessionLine,
  UNDO_SAVE_MS,
  undoSaveLeft,
  undoSaveVisible,
} from '../../../../../client/studio/edit/history/session.ts';
import type { Gesture } from '../../../../../client/studio/edit/store.ts';

const OPEN = { version: 4, startedAt: '2026-11-24T09:00:00.000Z' };

const step = (raw: boolean): Gesture => ({
  label: 'x',
  ops: [
    {
      op: 'setStyle',
      id: 'a:div',
      className: 'card',
      property: 'margin-top',
      value: raw ? { raw: '13px' } : { token: '--kit-space-md' },
      before: null,
      newRule: false,
    },
  ],
});

const kept = (savedAt: number): KeptSession => ({ session: OPEN, undo: [], redo: [], savedAt });

test('without a session the line says the first change starts a version', () => {
  assert.deepEqual(sessionLine(null, []), [{ key: 'session.none', params: {} }]);
});

test('an open session names its version and counts the undo steps', () => {
  assert.deepEqual(sessionLine(OPEN, [step(false), step(false)]), [
    { key: 'session.changes', params: { version: 4, count: 2 } },
  ]);
  assert.equal(sessionLine(OPEN, [step(false)])[0]?.key, 'session.change');
  assert.equal(sessionLine(OPEN, [])[0]?.key, 'session.changes');
});

test('the off-kit count joins the line only when there is one', () => {
  const parts = sessionLine(OPEN, [step(true), step(false), step(true)]);
  assert.deepEqual(parts[1], { key: 'session.offKit', params: { count: 2 } });
  assert.equal(sessionLine(OPEN, [step(false)]).length, 1);
  assert.equal(offKitSteps([step(false), step(true)]), 1);
});

test('undo, redo and save are off when there is nothing to do or a request is on its way', () => {
  const base = { undo: [step(false)], redo: [], busy: false, edit: null };
  assert.deepEqual(disabledButtons(base), { undo: false, redo: true, save: true });
  const open = {
    ...base,
    edit: { slug: 's', version: 4, session: OPEN, format: 'scss' as const, etags: {}, tokens: [] },
  };
  assert.deepEqual(disabledButtons(open), { undo: false, redo: true, save: false });
  assert.deepEqual(disabledButtons({ ...open, busy: true }), {
    undo: true,
    redo: true,
    save: true,
  });
  assert.equal(disabledButtons({ ...open, redo: [step(false)] }).redo, false);
});

test('Undo save has 8 seconds after the save', () => {
  assert.equal(UNDO_SAVE_MS, 8000);
  assert.equal(undoSaveLeft(1000, 1000), 8000);
  assert.equal(undoSaveLeft(1000, 6000), 3000);
  assert.equal(undoSaveLeft(1000, 9000), 0);
  assert.equal(undoSaveLeft(1000, 20000), 0);
  assert.equal(undoSaveLeft(5000, 1000), 0);
});

test('Undo save shows only inside its window, after a save, and until a new session starts', () => {
  assert.equal(undoSaveVisible(null, 2000, null), false);
  assert.equal(undoSaveVisible(kept(1000), 2000, null), true);
  assert.equal(undoSaveVisible(kept(1000), 9000, null), false);
  assert.equal(undoSaveVisible(kept(1000), 2000, { version: 5, startedAt: 'now' }), false);
});

test('the answer of the reopen call is reopened, refused (409) or failed', () => {
  assert.equal(reopenOutcome({ ok: true, status: 200 }), 'reopened');
  assert.equal(reopenOutcome({ ok: false, status: 409 }), 'refused');
  assert.equal(reopenOutcome({ ok: false, status: 0 }), 'failed');
  assert.equal(reopenOutcome({ ok: false, status: 500 }), 'failed');
});
