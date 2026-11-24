import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addsToSelection,
  EDIT_KEYS,
  parseEditFrame,
} from '../../../../client/channel/edit-protocol.ts';
import {
  idOf,
  type KeyLike,
  keyOf,
  pickOf,
  type TargetLike,
} from '../../../../client/frame/edit/edit.ts';

const press = (key: string, held: Partial<KeyLike> = {}): KeyLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...held,
});

/** An element inside the marked element `id`; `null` for one outside any. */
const inside = (id: string | null): TargetLike => ({
  closest: (selector) => {
    assert.equal(selector, '[data-ks]');
    return id === null ? null : { getAttribute: (name) => (name === 'data-ks' ? id : null) };
  },
});

test('Escape clears, the up arrow goes to the parent and the down arrow to the child', () => {
  assert.equal(keyOf(press('Escape')), 'clear');
  assert.equal(keyOf(press('ArrowUp')), 'parent');
  assert.equal(keyOf(press('ArrowDown')), 'child');
});

test('Ctrl+Z and Cmd+Z undo', () => {
  assert.equal(keyOf(press('z', { ctrlKey: true })), 'undo');
  assert.equal(keyOf(press('z', { metaKey: true })), 'undo');
});

test('Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y redo', () => {
  // With Shift held the key comes as a capital letter.
  assert.equal(keyOf(press('Z', { ctrlKey: true, shiftKey: true })), 'redo');
  assert.equal(keyOf(press('Z', { metaKey: true, shiftKey: true })), 'redo');
  assert.equal(keyOf(press('y', { ctrlKey: true })), 'redo');
  assert.equal(keyOf(press('Y', { ctrlKey: true })), 'redo');
});

test('Cmd+Y is not redo', () => {
  assert.equal(keyOf(press('y', { metaKey: true })), undefined);
});

test('every other key stays with the page', () => {
  assert.equal(keyOf(press('z')), undefined);
  assert.equal(keyOf(press('y')), undefined);
  assert.equal(keyOf(press('a', { ctrlKey: true })), undefined);
  assert.equal(keyOf(press('Enter')), undefined);
  assert.equal(keyOf(press('ArrowLeft')), undefined);
  assert.equal(keyOf(press('Tab')), undefined);
  assert.equal(keyOf(press(' ')), undefined);
});

test('a modifier that means something else keeps the key with the page', () => {
  assert.equal(keyOf(press('ArrowUp', { shiftKey: true })), undefined);
  assert.equal(keyOf(press('ArrowDown', { ctrlKey: true })), undefined);
  assert.equal(keyOf(press('ArrowUp', { metaKey: true })), undefined);
  assert.equal(keyOf(press('Escape', { shiftKey: true })), undefined);
  assert.equal(keyOf(press('z', { ctrlKey: true, altKey: true })), undefined);
  assert.equal(keyOf(press('Escape', { altKey: true })), undefined);
});

test('every key the mapping gives is one the protocol carries', () => {
  const presses = [
    press('Escape'),
    press('ArrowUp'),
    press('ArrowDown'),
    press('z', { ctrlKey: true }),
    press('y', { ctrlKey: true }),
  ];
  const keys = presses.map(keyOf);
  // Plan 14, task C4 maps the structure keys too and checks the whole list in keys.test.ts.
  for (const key of keys) assert.ok(key !== undefined && EDIT_KEYS.includes(key), String(key));
  for (const key of keys) assert.ok(parseEditFrame({ type: 'key', key }, 'probe'));
});

test('a click picks the nearest marked element around its target', () => {
  assert.deepEqual(pickOf(inside('sections/Hero:section/h1'), false, false), {
    id: 'sections/Hero:section/h1',
    add: false,
    double: false,
  });
});

test('a click outside any marked element picks nothing', () => {
  assert.deepEqual(pickOf(inside(null), false, false), { id: null, add: false, double: false });
  // A target that is no element at all, such as the document.
  assert.deepEqual(pickOf(null, false, false), { id: null, add: false, double: false });
});

test('Shift, Ctrl and Cmd each add to the selection; a plain or Alt click does not', () => {
  const held = (keys: Partial<KeyLike>) => addsToSelection({ ...press('x'), ...keys });
  assert.equal(held({ shiftKey: true }), true);
  assert.equal(held({ ctrlKey: true }), true);
  assert.equal(held({ metaKey: true }), true);
  assert.equal(held({}), false);
  assert.equal(held({ altKey: true }), false);
  // A Ctrl click picks the element with `add`, as a Shift click does.
  assert.deepEqual(pickOf(inside('A:main'), held({ ctrlKey: true }), false), {
    id: 'A:main',
    add: true,
    double: false,
  });
});

test('Shift adds to the selection and a double click is marked as one', () => {
  assert.deepEqual(pickOf(inside('A:main'), true, false), {
    id: 'A:main',
    add: true,
    double: false,
  });
  assert.deepEqual(pickOf(inside('A:main'), false, true), {
    id: 'A:main',
    add: false,
    double: true,
  });
  assert.deepEqual(pickOf(inside(null), true, true), { id: null, add: true, double: true });
});

test('an id the studio would refuse picks nothing', () => {
  assert.equal(idOf(inside('bad id"')), null);
  assert.equal(idOf(inside('')), null);
  assert.equal(idOf(inside('x'.repeat(201))), null);
  assert.equal(idOf(inside('A:ul/$/li')), 'A:ul/$/li');
});

test('every pick is a message the studio accepts', () => {
  for (const target of [inside('A:main'), inside(null), inside('bad id"'), null]) {
    const message = { type: 'pick', ...pickOf(target, true, true) };
    assert.ok(parseEditFrame(message, 'probe'));
  }
});
