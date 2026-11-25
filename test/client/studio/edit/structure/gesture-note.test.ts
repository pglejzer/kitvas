import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GESTURE_ENDS,
  type GestureEnd,
  type GestureLogMessage,
} from '../../../../../client/channel/gesture-protocol.ts';
import {
  endOf,
  gestureNoteKey,
  logLine,
} from '../../../../../client/studio/edit/structure/gesture-note.ts';

const log = (why: GestureEnd | null, tool: 'drag' | 'handle' = 'drag'): GestureLogMessage => ({
  kitvas: 1,
  channel: 'c1',
  type: 'gesture-log',
  tool,
  steps: [
    { at: 120, state: 'pressed', why: null },
    { at: 340, state: 'drag', why: null },
    { at: 910, state: 'idle', why },
  ],
});

test('an end that took the gesture away gets a line', () => {
  for (const why of ['blur', 'no-buttons', 'cancelled', 'capture-lost', 'unloaded'] as const) {
    assert.equal(gestureNoteKey(log(why)), `gesture.${why}`);
  }
  assert.equal(gestureNoteKey(log('selection-changed', 'handle')), 'gesture.selection-changed');
  assert.equal(gestureNoteKey(log('no-move')), 'gesture.no-move');
});

test('an end the person chose gets none', () => {
  for (const why of ['escape', 'no-slot', 'same-place', 'not-moved', 'released'] as const) {
    assert.equal(gestureNoteKey(log(why)), null, why);
  }
  assert.equal(gestureNoteKey(log(null)), null);
  assert.equal(gestureNoteKey({ ...log('blur'), steps: [] }), null);
});

test('the reasons that are said are these seven', () => {
  const said = GESTURE_ENDS.filter((why) => gestureNoteKey(log(why)) !== null);
  assert.deepEqual(said, [
    'no-move',
    'blur',
    'no-buttons',
    'cancelled',
    'capture-lost',
    'selection-changed',
    'unloaded',
  ]);
});

test('the reason is the one of the last step', () => {
  assert.equal(endOf(log('blur')), 'blur');
  assert.equal(endOf({ ...log('blur'), steps: [] }), null);
});

test('the log reads as one line', () => {
  assert.equal(logLine(log('blur')), 'drag pressed@120 drag@340 idle@910:blur');
});
