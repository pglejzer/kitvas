// The command list's key steps (redesign spec goal 10; plan 19, task T3; Review Focus 4): arrows
// wrap, Enter runs an enabled option only, Escape closes, and an empty list sends nothing.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isListKey, listKey } from '../../../../../client/studio/edit/ask/command-list.ts';
import type { Command } from '../../../../../client/studio/edit/ask/commands.ts';

const command = (id: Command['id'], enabled: boolean): Command => ({
  id,
  label: id,
  keys: null,
  enabled,
  reason: enabled ? null : 'why',
  icon: null,
});

const LIST = [command('improve', true), command('delete', false), command('copy', true)];

test('ArrowDown moves on and wraps to the first', () => {
  assert.deepEqual(listKey(LIST, 0, 'ArrowDown'), { kind: 'move', active: 1 });
  assert.deepEqual(listKey(LIST, 2, 'ArrowDown'), { kind: 'move', active: 0 });
});

test('ArrowUp moves back and wraps to the last', () => {
  assert.deepEqual(listKey(LIST, 1, 'ArrowUp'), { kind: 'move', active: 0 });
  assert.deepEqual(listKey(LIST, 0, 'ArrowUp'), { kind: 'move', active: 2 });
});

test('Enter runs the active command when it is on', () => {
  const step = listKey(LIST, 2, 'Enter');
  assert.equal(step.kind, 'run');
  assert.equal(step.kind === 'run' ? step.command.id : null, 'copy');
});

test('Enter on a command that is off runs nothing', () => {
  assert.deepEqual(listKey(LIST, 1, 'Enter'), { kind: 'stay' });
});

test('with no match every key but Escape stays, and nothing runs', () => {
  assert.deepEqual(listKey([], 0, 'Enter'), { kind: 'stay' });
  assert.deepEqual(listKey([], 0, 'ArrowDown'), { kind: 'stay' });
  assert.deepEqual(listKey([], 0, 'Escape'), { kind: 'close' });
});

test('Escape closes the list', () => {
  assert.deepEqual(listKey(LIST, 1, 'Escape'), { kind: 'close' });
});

test('only the four keys of the list are taken', () => {
  assert.equal(isListKey('ArrowDown'), true);
  assert.equal(isListKey('Enter'), true);
  assert.equal(isListKey('Home'), false);
  assert.equal(isListKey('a'), false);
});
