import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EDIT_KEYS, parseEditFrame } from '../../../client/channel/edit-protocol.ts';
import { type KeyLike, keyOf } from '../../../client/frame/keys.ts';

const press = (key: string, held: Partial<KeyLike> = {}): KeyLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...held,
});

test('the structure keys map to their editor keys', () => {
  assert.equal(keyOf(press('Delete')), 'delete');
  assert.equal(keyOf(press('Backspace')), 'delete');
  assert.equal(keyOf(press('d', { ctrlKey: true })), 'duplicate');
  assert.equal(keyOf(press('d', { metaKey: true })), 'duplicate');
  assert.equal(keyOf(press('c', { ctrlKey: true })), 'copy');
  assert.equal(keyOf(press('x', { metaKey: true })), 'cut');
  assert.equal(keyOf(press('v', { ctrlKey: true })), 'paste');
  assert.equal(keyOf(press('ArrowUp', { altKey: true })), 'move-up');
  assert.equal(keyOf(press('ArrowDown', { altKey: true })), 'move-down');
  assert.equal(keyOf(press('g', { ctrlKey: true })), 'wrap');
  assert.equal(keyOf(press('G', { ctrlKey: true, shiftKey: true })), 'unwrap');
  assert.equal(keyOf(press('G', { metaKey: true, shiftKey: true })), 'unwrap');
  assert.equal(keyOf(press('F10', { shiftKey: true })), 'menu');
  assert.equal(keyOf(press('ContextMenu')), 'menu');
});

test('the four 4a keys still map as before', () => {
  assert.equal(keyOf(press('Escape')), 'clear');
  assert.equal(keyOf(press('ArrowUp')), 'parent');
  assert.equal(keyOf(press('ArrowDown')), 'child');
  assert.equal(keyOf(press('z', { ctrlKey: true })), 'undo');
  assert.equal(keyOf(press('Z', { ctrlKey: true, shiftKey: true })), 'redo');
  assert.equal(keyOf(press('y', { ctrlKey: true })), 'redo');
});

test('the mapping gives exactly the keys the protocol carries', () => {
  const presses = [
    press('Escape'),
    press('ArrowUp'),
    press('ArrowDown'),
    press('z', { ctrlKey: true }),
    press('y', { ctrlKey: true }),
    press('Delete'),
    press('d', { ctrlKey: true }),
    press('c', { ctrlKey: true }),
    press('x', { ctrlKey: true }),
    press('v', { ctrlKey: true }),
    press('ArrowUp', { altKey: true }),
    press('ArrowDown', { altKey: true }),
    press('g', { ctrlKey: true }),
    press('G', { ctrlKey: true, shiftKey: true }),
    press('F10', { shiftKey: true }),
  ];
  const keys = new Set(presses.map(keyOf));
  assert.deepEqual([...keys].sort(), [...EDIT_KEYS].sort());
  for (const key of keys) assert.ok(parseEditFrame({ type: 'key', key }, 'probe'));
});

test('a letter alone, or with a modifier that means something else, stays with the page', () => {
  assert.equal(keyOf(press('d')), undefined);
  assert.equal(keyOf(press('c')), undefined);
  assert.equal(keyOf(press('Delete', { ctrlKey: true })), undefined);
  assert.equal(keyOf(press('d', { ctrlKey: true, shiftKey: true })), undefined);
  assert.equal(keyOf(press('d', { ctrlKey: true, altKey: true })), undefined);
  assert.equal(keyOf(press('ArrowUp', { altKey: true, ctrlKey: true })), undefined);
  assert.equal(keyOf(press('ArrowLeft', { altKey: true })), undefined);
  assert.equal(keyOf(press('F10')), undefined);
  assert.equal(keyOf(press('F10', { shiftKey: true, ctrlKey: true })), undefined);
});
