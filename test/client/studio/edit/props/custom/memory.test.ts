import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCustomMemory,
  listChoice,
} from '../../../../../../client/studio/edit/props/custom/memory.ts';

const ITEMS = { custom: '__custom', raw: '__raw' };
const ROW = 'style:color';

/** The panel: a redraw draws every row with `open` as the memory has it, as `tokenRow` does. */
function panel() {
  const drawn: boolean[] = [];
  const memory = createCustomMemory(() => drawn.push(memory.has(ROW)));
  /** What a pick in the list does, as `tokenPicker` calls it. */
  const pick = (value: string): void => {
    const choice = listChoice(value, memory.has(ROW), ITEMS);
    if (choice === 'show') memory.open(ROW);
    else memory.close(ROW);
  };
  return { drawn, memory, pick };
}

test('the cause: Custom... picked in a list is still open after the redraw the list asks for', () => {
  const { drawn, memory, pick } = panel();
  pick(ITEMS.custom);
  // The list closes after the pick and the pane is drawn again.
  assert.equal(memory.has(ROW), true);
  assert.equal(drawn.at(-1), true);
});

test('the cursor goes to the editor once after the redraw', () => {
  const { memory, pick } = panel();
  pick(ITEMS.custom);
  assert.equal(memory.takeFocus(), ROW);
  assert.equal(memory.takeFocus(), null);
});

test('picking a token closes the editor and no focus is asked', () => {
  const { memory, pick, drawn } = panel();
  pick(ITEMS.custom);
  pick('--kit-colour-ink');
  assert.equal(memory.has(ROW), false);
  assert.equal(drawn.at(-1), false);
  assert.equal(memory.takeFocus(), null);
});

test('Custom... pressed again closes the editor', () => {
  const { memory, pick } = panel();
  pick(ITEMS.custom);
  pick(ITEMS.custom);
  assert.equal(memory.has(ROW), false);
});

test('the stepper button and the list share the one memory', () => {
  const { memory, pick } = panel();
  memory.toggle(ROW);
  assert.equal(listChoice(ITEMS.custom, memory.has(ROW), ITEMS), 'hide');
  pick(ITEMS.custom);
  assert.equal(memory.has(ROW), false);
});

test('a new selection forgets every row', () => {
  const { memory, pick } = panel();
  pick(ITEMS.custom);
  memory.clear();
  assert.equal(memory.has(ROW), false);
  assert.equal(memory.takeFocus(), null);
});

test('Escape closes the editor, and after the redraw the cursor goes back to its opener once', () => {
  const { memory, drawn } = panel();
  memory.toggle(ROW);
  memory.takeFocus();
  assert.equal(memory.cancel(ROW), true);
  assert.equal(memory.has(ROW), false);
  assert.equal(drawn.at(-1), false);
  assert.equal(memory.takeBack(), ROW);
  assert.equal(memory.takeBack(), null);
  assert.equal(memory.takeFocus(), null);
});

test('Escape in an editor the memory does not hold (a raw value) draws nothing and asks nothing', () => {
  const { memory, drawn } = panel();
  assert.equal(memory.cancel(ROW), false);
  assert.deepEqual(drawn, []);
  assert.equal(memory.takeBack(), null);
});

test('6: a press outside forgets the row with no redraw, no cursor back and no cursor in', () => {
  const { memory, drawn } = panel();
  memory.toggle(ROW);
  const draws = drawn.length;
  assert.equal(memory.drop(ROW), true);
  assert.equal(memory.has(ROW), false);
  assert.equal(drawn.length, draws);
  assert.equal(memory.takeBack(), null);
  assert.equal(memory.takeFocus(), null);
});

test('a press outside an editor the memory does not hold asks nothing', () => {
  const { memory, drawn } = panel();
  assert.equal(memory.drop(ROW), false);
  assert.deepEqual(drawn, []);
});

test('the raw item of the source shows the editor; a token is a token', () => {
  assert.equal(listChoice(ITEMS.raw, false, ITEMS), 'show');
  assert.equal(listChoice('--kit-x', true, ITEMS), 'token');
});
