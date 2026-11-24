import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isCanvasFrame,
  isCanvasStudio,
  MAX_CANVAS_PX,
  MAX_DELTA,
  SHELL_KEYS,
  type ShellKeyLike,
  shellKeyOf,
} from '../../../client/channel/canvas-protocol.ts';
import { parseFrameMessage, parseStudioMessage } from '../../../client/channel/protocol.ts';

const CHANNEL = 'abcdefghijklmnop';
const OTHER = 'ponmlkjihgfedcba';

/** A message on CHANNEL. */
const sent = (fields: Record<string, unknown>) => ({ kitvas: 1, channel: CHANNEL, ...fields });
const head = { kitvas: 1, channel: CHANNEL };

const press = (key: string, code: string, held: Partial<ShellKeyLike> = {}): ShellKeyLike => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...held,
});

test('a frame may send the zoom wheel, Space, a screen key and where an element is', () => {
  const wheel = sent({ type: 'zoom-wheel', x: 120.5, y: 40, deltaY: -3 });
  assert.deepEqual(parseFrameMessage(wheel, CHANNEL), { ...head, ...wheel });
  for (const down of [true, false]) {
    const space = sent({ type: 'space', down });
    assert.deepEqual(parseFrameMessage(space, CHANNEL), space);
  }
  for (const key of SHELL_KEYS) {
    const pressed = sent({ type: 'shell-key', key });
    assert.deepEqual(parseFrameMessage(pressed, CHANNEL), pressed, key);
  }
  const box = { x: -10, y: 20.5, width: 300, height: 0 };
  const located = sent({ type: 'located', request: 4, box });
  assert.deepEqual(parseFrameMessage(located, CHANNEL), located);
  const gone = sent({ type: 'located', request: 5, box: null });
  assert.deepEqual(parseFrameMessage(gone, CHANNEL), gone);
});

test('the page may ask a frame where an element is', () => {
  const locate = sent({ type: 'locate', request: 2, id: 'sections/Hero:section/Button.2' });
  assert.deepEqual(parseStudioMessage(locate, CHANNEL), locate);
});

test('the page tells a frame the canvas zoom, inside the limits only', () => {
  const zoom = sent({ type: 'zoom', value: 0.25 });
  assert.deepEqual(parseStudioMessage(zoom, CHANNEL), zoom);
  for (const value of [0, 0.01, 9, Number.NaN, Number.POSITIVE_INFINITY, '1', null]) {
    assert.equal(parseStudioMessage(sent({ type: 'zoom', value }), CHANNEL), undefined);
  }
});

test('a frame tells how far it scrolled and the page sends the other side there', () => {
  const scrolled = sent({ type: 'scrolled', ratio: 0.4 });
  assert.deepEqual(parseFrameMessage(scrolled, CHANNEL), scrolled);
  const follow = sent({ type: 'scroll-to', ratio: 1 });
  assert.deepEqual(parseStudioMessage(follow, CHANNEL), follow);
  for (const ratio of [-0.1, 1.1, Number.NaN, '0.5', null]) {
    assert.equal(parseFrameMessage(sent({ type: 'scrolled', ratio }), CHANNEL), undefined);
    assert.equal(parseStudioMessage(sent({ type: 'scroll-to', ratio }), CHANNEL), undefined);
  }
});

test('only what the protocol names goes through, whatever else a message carries', () => {
  const wheel = sent({ type: 'zoom-wheel', x: 1, y: 2, deltaY: 3, html: '<b>', extra: 1 });
  assert.deepEqual(parseFrameMessage(wheel, CHANNEL), {
    ...head,
    type: 'zoom-wheel',
    x: 1,
    y: 2,
    deltaY: 3,
  });
  const locate = sent({ type: 'locate', request: 1, id: 'index:Hero', run: 'x' });
  assert.deepEqual(parseStudioMessage(locate, CHANNEL), {
    ...head,
    type: 'locate',
    request: 1,
    id: 'index:Hero',
  });
});

test('a wheel step larger than the limit is cut to it, in both directions', () => {
  const big = parseFrameMessage(sent({ type: 'zoom-wheel', x: 0, y: 0, deltaY: 1e9 }), CHANNEL);
  assert.ok(big && big.type === 'zoom-wheel');
  assert.equal(big.deltaY, MAX_DELTA);
  const small = parseFrameMessage(sent({ type: 'zoom-wheel', x: 0, y: 0, deltaY: -1e9 }), CHANNEL);
  assert.ok(small && small.type === 'zoom-wheel');
  assert.equal(small.deltaY, -MAX_DELTA);
});

test('bad canvas messages from a frame are refused', () => {
  const bad: Record<string, unknown>[] = [
    { type: 'zoom-wheel', x: 'left', y: 0, deltaY: 1 },
    { type: 'zoom-wheel', x: 0, y: MAX_CANVAS_PX + 1, deltaY: 1 },
    { type: 'zoom-wheel', x: 0, y: 0, deltaY: Number.NaN },
    { type: 'zoom-wheel', x: 0, y: 0, deltaY: Number.POSITIVE_INFINITY },
    { type: 'zoom-wheel', x: Number.NaN, y: 0, deltaY: 1 },
    { type: 'zoom-wheel', x: 0, y: 0 },
    { type: 'space' },
    { type: 'space', down: 1 },
    { type: 'space', down: 'true' },
    { type: 'shell-key' },
    { type: 'shell-key', key: 'save' },
    { type: 'shell-key', key: 7 },
    { type: 'located', request: 1 },
    { type: 'located', request: -1, box: null },
    { type: 'located', request: 1.5, box: null },
    { type: 'located', request: 1, box: 'here' },
    { type: 'located', request: 1, box: [] },
    { type: 'located', request: 1, box: { x: 0, y: 0, width: -1, height: 2 } },
    { type: 'located', request: 1, box: { x: 0, y: 0, width: 1 } },
    { type: 'located', request: 1, box: { x: 0, y: 0, width: MAX_CANVAS_PX + 1, height: 2 } },
    { type: 'located', request: 1, box: { x: Number.NaN, y: 0, width: 1, height: 2 } },
  ];
  for (const fields of bad) {
    assert.equal(parseFrameMessage(sent(fields), CHANNEL), undefined, JSON.stringify(fields));
  }
});

test('bad canvas messages from the page are refused', () => {
  const bad: Record<string, unknown>[] = [
    { type: 'locate', request: 1 },
    { type: 'locate', request: 1, id: '' },
    { type: 'locate', request: 1, id: 'a b' },
    { type: 'locate', request: 1, id: '"]<script>' },
    { type: 'locate', request: 1, id: 'x'.repeat(201) },
    { type: 'locate', request: -1, id: 'index:Hero' },
    { type: 'locate', request: '1', id: 'index:Hero' },
    { type: 'locate', id: 'index:Hero' },
  ];
  for (const fields of bad) {
    assert.equal(parseStudioMessage(sent(fields), CHANNEL), undefined, JSON.stringify(fields));
  }
});

test('a canvas message on another channel, or going the wrong way, is refused', () => {
  const space = sent({ type: 'space', down: true });
  const locate = sent({ type: 'locate', request: 1, id: 'index:Hero' });
  assert.equal(parseFrameMessage(space, OTHER), undefined);
  assert.equal(parseStudioMessage(locate, OTHER), undefined);
  // A frame never asks the page to locate, and the page never sends a frame's messages.
  assert.equal(parseFrameMessage(locate, CHANNEL), undefined);
  assert.equal(parseStudioMessage(space, CHANNEL), undefined);
});

test('canvas messages are told apart from the others by their type', () => {
  for (const type of ['zoom-wheel', 'space', 'shell-key', 'located']) {
    assert.ok(isCanvasFrame({ type }), type);
    assert.ok(!isCanvasStudio({ type }), type);
  }
  assert.ok(isCanvasStudio({ type: 'locate' }));
  assert.ok(!isCanvasFrame({ type: 'locate' }));
  for (const type of ['ready', 'shown', 'elements', 'pick', 'key', 'measure', 'edit']) {
    assert.ok(!isCanvasFrame({ type }), type);
    assert.ok(!isCanvasStudio({ type }), type);
  }
});

test('Shift+1 fits and Shift+2 zooms to the selection, by the key code of any layout', () => {
  assert.equal(shellKeyOf(press('!', 'Digit1', { shiftKey: true })), 'fit');
  assert.equal(shellKeyOf(press('@', 'Digit2', { shiftKey: true })), 'selection');
  // Another layout types another character with the same key.
  assert.equal(shellKeyOf(press('1', 'Digit1', { shiftKey: true })), 'fit');
  assert.equal(shellKeyOf(press('"', 'Digit2', { shiftKey: true })), 'selection');
  // Without Shift the digit is typed, not a screen key.
  assert.equal(shellKeyOf(press('1', 'Digit1')), null);
  assert.equal(shellKeyOf(press('2', 'Digit2')), null);
});

test('Ctrl+0 and Cmd+0 are 100 %, and Ctrl or Cmd with \\ folds both panels', () => {
  assert.equal(shellKeyOf(press('0', 'Digit0', { ctrlKey: true })), 'actual');
  assert.equal(shellKeyOf(press('0', 'Digit0', { metaKey: true })), 'actual');
  assert.equal(shellKeyOf(press('\\', 'Backslash', { ctrlKey: true })), 'fold-both');
  assert.equal(shellKeyOf(press('\\', 'Backslash', { metaKey: true })), 'fold-both');
  assert.equal(shellKeyOf(press('0', 'Digit0')), null);
  assert.equal(shellKeyOf(press('\\', 'Backslash')), null);
});

test('the 4b zoom keys that changed are gone: Ctrl+1 does nothing', () => {
  assert.equal(shellKeyOf(press('1', 'Digit1', { ctrlKey: true })), null);
  assert.equal(shellKeyOf(press('1', 'Digit1', { metaKey: true })), null);
  assert.equal(shellKeyOf(press('!', 'Digit1', { ctrlKey: true, shiftKey: true })), null);
  assert.equal(shellKeyOf(press(')', 'Digit0', { ctrlKey: true, shiftKey: true })), null);
});

test('[ and ] fold the left and the right panel, and ? opens the shortcuts', () => {
  assert.equal(shellKeyOf(press('[', 'BracketLeft')), 'fold-left');
  assert.equal(shellKeyOf(press(']', 'BracketRight')), 'fold-right');
  // `?` is a shifted key on most layouts and a plain one on some.
  assert.equal(shellKeyOf(press('?', 'Slash', { shiftKey: true })), 'shortcuts');
  assert.equal(shellKeyOf(press('?', 'Minus')), 'shortcuts');
  assert.equal(shellKeyOf(press('{', 'BracketLeft', { shiftKey: true })), null);
  assert.equal(shellKeyOf(press('[', 'BracketLeft', { ctrlKey: true })), null);
});

test('Alt with any key is never a screen key', () => {
  const alt = { altKey: true };
  assert.equal(shellKeyOf(press('!', 'Digit1', { ...alt, shiftKey: true })), null);
  assert.equal(shellKeyOf(press('0', 'Digit0', { ...alt, ctrlKey: true })), null);
  assert.equal(shellKeyOf(press('[', 'BracketLeft', alt)), null);
  assert.equal(shellKeyOf(press('?', 'Slash', { ...alt, shiftKey: true })), null);
});

test('every screen key has a key press, and the mapping gives no other', () => {
  const presses = [
    press('!', 'Digit1', { shiftKey: true }),
    press('@', 'Digit2', { shiftKey: true }),
    press('0', 'Digit0', { ctrlKey: true }),
    press('[', 'BracketLeft'),
    press(']', 'BracketRight'),
    press('\\', 'Backslash', { ctrlKey: true }),
    press('?', 'Slash', { shiftKey: true }),
  ];
  const keys = presses.map(shellKeyOf);
  assert.deepEqual([...keys].sort(), [...SHELL_KEYS].sort());
  for (const key of keys) {
    assert.ok(parseFrameMessage(sent({ type: 'shell-key', key }), CHANNEL), String(key));
  }
  for (const letter of ['a', 'z', 'Enter', 'Escape', ' ', 'ArrowUp']) {
    assert.equal(shellKeyOf(press(letter, 'KeyA')), null, letter);
  }
});
