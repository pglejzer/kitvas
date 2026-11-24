import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditKey } from '../../../client/channel/edit-protocol.ts';
import type { ActionState } from '../../../client/studio/edit/actions.ts';
import {
  actionOfKey,
  editKeyOf,
  historyKeyOf,
  isTextTarget,
  type KeyLike,
  resolveKey,
} from '../../../client/studio/edit/keys.ts';

const press = (key: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});

test('each key of the spec gives its structure key', () => {
  const cases: [KeyLike, EditKey][] = [
    [press('Delete'), 'delete'],
    [press('Backspace'), 'delete'],
    [press('d', { ctrlKey: true }), 'duplicate'],
    [press('D', { metaKey: true }), 'duplicate'],
    [press('c', { ctrlKey: true }), 'copy'],
    [press('x', { ctrlKey: true }), 'cut'],
    [press('v', { metaKey: true }), 'paste'],
    [press('ArrowUp', { altKey: true }), 'move-up'],
    [press('ArrowDown', { altKey: true }), 'move-down'],
    [press('g', { ctrlKey: true }), 'wrap'],
    [press('G', { ctrlKey: true, shiftKey: true }), 'unwrap'],
    [press('F10', { shiftKey: true }), 'menu'],
    [press('ContextMenu'), 'menu'],
  ];
  for (const [event, key] of cases) assert.equal(editKeyOf(event), key, event.key);
});

test('other keys and other modifier mixes give nothing', () => {
  assert.equal(editKeyOf(press('a')), null);
  assert.equal(editKeyOf(press('F10')), null);
  assert.equal(editKeyOf(press('d')), null);
  assert.equal(editKeyOf(press('ArrowUp')), null);
  assert.equal(editKeyOf(press('c', { ctrlKey: true, shiftKey: true })), null);
  assert.equal(editKeyOf(press('d', { ctrlKey: true, altKey: true })), null);
  assert.equal(editKeyOf(press('Delete', { ctrlKey: true })), null);
  // Undo and redo are the history's keys (mode.ts), not this file's.
  assert.equal(editKeyOf(press('z', { ctrlKey: true })), null);
});

test('every structure key but the menu key maps to an action', () => {
  assert.equal(actionOfKey('delete'), 'delete');
  assert.equal(actionOfKey('duplicate'), 'duplicate');
  assert.equal(actionOfKey('copy'), 'copy');
  assert.equal(actionOfKey('cut'), 'cut');
  assert.equal(actionOfKey('paste'), 'paste');
  assert.equal(actionOfKey('move-up'), 'move-up');
  assert.equal(actionOfKey('move-down'), 'move-down');
  assert.equal(actionOfKey('wrap'), 'wrap-stack');
  assert.equal(actionOfKey('unwrap'), 'unwrap');
  assert.equal(actionOfKey('menu'), null);
  assert.equal(actionOfKey('undo'), null);
});

test('nothing happens in a text field, a select, a textarea or contenteditable', () => {
  assert.equal(isTextTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTextTarget({ tagName: 'textarea' }), true);
  assert.equal(isTextTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTextTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTextTarget({ tagName: 'DIV', isContentEditable: false }), false);
  assert.equal(isTextTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTextTarget(null), false);
});

const ACTIONS: ActionState[] = [
  { id: 'delete', enabled: false, reason: 'section-root' },
  { id: 'duplicate', enabled: true, reason: null },
  { id: 'wrap-stack', enabled: true, reason: null },
];

test('a key runs its action only when the action is on', () => {
  assert.equal(resolveKey('duplicate', ACTIONS), 'duplicate');
  assert.equal(resolveKey('wrap', ACTIONS), 'wrap-stack');
  assert.equal(resolveKey('delete', ACTIONS), null);
  assert.equal(resolveKey('paste', ACTIONS), null);
});

test('the menu key opens the menu whatever the actions are', () => {
  assert.equal(resolveKey('menu', []), 'menu');
  assert.equal(resolveKey('menu', ACTIONS), 'menu');
});

test('undo and redo on the page take the same keys as in the frame', () => {
  assert.equal(historyKeyOf(press('z', { ctrlKey: true })), 'undo');
  assert.equal(historyKeyOf(press('z', { metaKey: true })), 'undo');
  assert.equal(historyKeyOf(press('Z', { ctrlKey: true, shiftKey: true })), 'redo');
  assert.equal(historyKeyOf(press('y', { ctrlKey: true })), 'redo');
  assert.equal(historyKeyOf(press('z')), null);
  assert.equal(historyKeyOf(press('z', { ctrlKey: true, altKey: true })), null);
  assert.equal(historyKeyOf(press('g', { ctrlKey: true })), null);
});
