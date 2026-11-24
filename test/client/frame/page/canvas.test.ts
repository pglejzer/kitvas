import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_CANVAS_PX, MAX_DELTA } from '../../../../client/channel/canvas-protocol.ts';
import { parseFrameMessage } from '../../../../client/channel/protocol.ts';
import {
  boxOf,
  isField,
  type SpaceLike,
  scrollRatio,
  scrollTopOf,
  spaceStep,
  type WheelLike,
  wheelOf,
} from '../../../../client/frame/page/canvas.ts';

const CHANNEL = 'abcdefghijklmnop';

const wheel = (fields: Partial<WheelLike> = {}): WheelLike => ({
  ctrlKey: false,
  metaKey: false,
  clientX: 100,
  clientY: 50,
  deltaY: -4,
  deltaMode: 0,
  ...fields,
});

const key = (type: string, fields: Partial<SpaceLike> = {}): SpaceLike => ({
  type,
  code: 'Space',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...fields,
});

const EDITING = { edit: true, down: false, field: false };

test('a plain wheel stays in the frame: it scrolls the page there', () => {
  assert.equal(wheelOf(wheel()), null);
});

test('Ctrl or Cmd with the wheel, and a pinch, go to the page with the pointer', () => {
  const sent = { x: 100, y: 50, deltaY: -4 };
  assert.deepEqual(wheelOf(wheel({ ctrlKey: true })), sent);
  assert.deepEqual(wheelOf(wheel({ metaKey: true })), sent);
});

test('a wheel that reports lines or pages is sent in pixels', () => {
  assert.equal(wheelOf(wheel({ ctrlKey: true, deltaY: 3, deltaMode: 1 }))?.deltaY, 48);
  assert.equal(wheelOf(wheel({ ctrlKey: true, deltaY: -1, deltaMode: 2 }))?.deltaY, -400);
});

test('what is sent for a wheel always passes the protocol', () => {
  const far = wheelOf(wheel({ ctrlKey: true, clientX: 1e9, clientY: -1e9, deltaY: 1e9 }));
  assert.deepEqual(far, { x: MAX_CANVAS_PX, y: -MAX_CANVAS_PX, deltaY: MAX_DELTA });
  const message = { kitvas: 1, channel: CHANNEL, type: 'zoom-wheel', ...far };
  assert.ok(parseFrameMessage(message, CHANNEL));
  assert.equal(wheelOf(wheel({ ctrlKey: true, deltaY: Number.NaN })), null);
  assert.equal(wheelOf(wheel({ ctrlKey: true, clientX: Number.POSITIVE_INFINITY })), null);
});

test('inputs, textareas, selects and text edited in place are fields', () => {
  assert.ok(isField({ tagName: 'INPUT' }));
  assert.ok(isField({ tagName: 'textarea' }));
  assert.ok(isField({ tagName: 'SELECT' }));
  assert.ok(isField({ tagName: 'P', isContentEditable: true }));
  assert.ok(!isField({ tagName: 'BUTTON' }));
  assert.ok(!isField({ tagName: 'DIV', isContentEditable: false }));
  assert.ok(!isField({}));
  assert.ok(!isField(null));
});

test('in Edit mode Space goes down once and is kept from the page', () => {
  assert.deepEqual(spaceStep(key('keydown'), EDITING), { send: true, prevent: true });
  // The key repeats while held: the page is not told again, and the frame still does not scroll.
  const held = { ...EDITING, down: true };
  assert.deepEqual(spaceStep(key('keydown'), held), { send: null, prevent: true });
  assert.deepEqual(spaceStep(key('keyup'), held), { send: false, prevent: true });
});

test('in Preview Space belongs to the prototype', () => {
  const preview = { edit: false, down: false, field: false };
  assert.deepEqual(spaceStep(key('keydown'), preview), { send: null, prevent: false });
  assert.deepEqual(spaceStep(key('keyup'), preview), { send: null, prevent: false });
});

test('Space typed into a field, or with Ctrl, Cmd or Alt, is not a pan', () => {
  const nothing = { send: null, prevent: false };
  assert.deepEqual(spaceStep(key('keydown'), { ...EDITING, field: true }), nothing);
  assert.deepEqual(spaceStep(key('keydown', { ctrlKey: true }), EDITING), nothing);
  assert.deepEqual(spaceStep(key('keydown', { metaKey: true }), EDITING), nothing);
  assert.deepEqual(spaceStep(key('keydown', { altKey: true }), EDITING), nothing);
});

test('a Space that went down always comes up, whatever happened meanwhile', () => {
  // Edit mode went off, or focus moved into a field, while the key was held.
  const up = { send: false, prevent: true };
  assert.deepEqual(spaceStep(key('keyup'), { edit: false, down: true, field: false }), up);
  assert.deepEqual(spaceStep(key('keyup'), { edit: true, down: true, field: true }), up);
  assert.deepEqual(spaceStep(key('keyup', { ctrlKey: true }), { ...EDITING, down: true }), up);
});

test('other keys and other events mean nothing to the pan', () => {
  const nothing = { send: null, prevent: false };
  assert.deepEqual(spaceStep(key('keydown', { code: 'Enter' }), EDITING), nothing);
  assert.deepEqual(spaceStep(key('keyup', { code: 'KeyA' }), { ...EDITING, down: true }), nothing);
  assert.deepEqual(spaceStep(key('keypress'), EDITING), nothing);
});

test('an element box is sent in the frame viewport pixels, and passes the protocol', () => {
  const box = boxOf({ left: -12.5, top: 300, width: 240, height: 48 });
  assert.deepEqual(box, { x: -12.5, y: 300, width: 240, height: 48 });
  const message = { kitvas: 1, channel: CHANNEL, type: 'located', request: 1, box };
  assert.ok(parseFrameMessage(message, CHANNEL));
});

test('a box the protocol would refuse is sent as none, and a huge one is cut', () => {
  assert.equal(boxOf({ left: Number.NaN, top: 0, width: 1, height: 1 }), null);
  assert.equal(boxOf({ left: MAX_CANVAS_PX + 1, top: 0, width: 1, height: 1 }), null);
  assert.equal(boxOf({ left: 0, top: 0, width: -1, height: 1 }), null);
  const tall = boxOf({ left: 0, top: 0, width: 10, height: 5e6 });
  assert.deepEqual(tall, { x: 0, y: 0, width: 10, height: MAX_CANVAS_PX });
  const message = { kitvas: 1, channel: CHANNEL, type: 'located', request: 1, box: tall };
  assert.ok(parseFrameMessage(message, CHANNEL));
});

test('compare scrolls both sides to the same place of each page', () => {
  assert.equal(scrollRatio(0, 3000, 800), 0);
  assert.equal(scrollRatio(1100, 3000, 800), 0.5);
  assert.equal(scrollRatio(2200, 3000, 800), 1);
  // Past the end (an elastic scroll) and before the start stay inside.
  assert.equal(scrollRatio(2600, 3000, 800), 1);
  assert.equal(scrollRatio(-40, 3000, 800), 0);
  // A page no taller than the view, or a broken number, is at the top.
  assert.equal(scrollRatio(10, 800, 800), 0);
  assert.equal(scrollRatio(Number.NaN, 3000, 800), 0);
  // The other side is shorter: the same ratio lands at its own middle.
  assert.equal(scrollTopOf(0.5, 2000, 800), 600);
  assert.equal(scrollTopOf(2, 2000, 800), 1200);
  assert.equal(scrollTopOf(0.5, 500, 800), 0);
});
