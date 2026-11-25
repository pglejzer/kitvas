import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanScroll,
  frameHash,
  MAX_SCROLL,
  parseFrameMessage,
  readHash,
  withScroll,
} from '../../../client/channel/protocol.ts';

const CHANNEL = 'abcdefghijklmnop';
const swap = (fields: Record<string, unknown>) => ({
  kitvas: 1,
  channel: CHANNEL,
  type: 'swap',
  live: 3,
  step: 'failed',
  ...fields,
});

test('a failed swap answer carries a scroll, rounded and kept within bounds', () => {
  assert.deepEqual(parseFrameMessage(swap({ scroll: { x: 0, y: 600 } }), CHANNEL), {
    kitvas: 1,
    channel: CHANNEL,
    type: 'swap',
    live: 3,
    step: 'failed',
    scroll: { x: 0, y: 600 },
  });
  const rounded = parseFrameMessage(swap({ scroll: { x: 1.4, y: 599.6 } }), CHANNEL);
  assert.deepEqual(rounded && 'scroll' in rounded ? rounded.scroll : null, { x: 1, y: 600 });
  const clamped = parseFrameMessage(swap({ scroll: { x: -5, y: 1e12 } }), CHANNEL);
  assert.deepEqual(clamped && 'scroll' in clamped ? clamped.scroll : null, { x: 0, y: MAX_SCROLL });
});

test('a swap answer without a scroll, or with a bad one, is still an answer with none', () => {
  const bare = { kitvas: 1, channel: CHANNEL, type: 'swap', live: 3, step: 'failed' };
  assert.deepEqual(parseFrameMessage(swap({}), CHANNEL), bare);
  const bad: unknown[] = [
    null,
    'top',
    [],
    {},
    { x: 0 },
    { x: '0', y: '5' },
    { x: Number.NaN, y: 1 },
    { x: 1, y: Number.POSITIVE_INFINITY },
  ];
  for (const scroll of bad) {
    assert.deepEqual(parseFrameMessage(swap({ scroll }), CHANNEL), bare, JSON.stringify(scroll));
  }
});

test('cleanScroll refuses anything that is no pair of finite numbers', () => {
  assert.deepEqual(cleanScroll(2.5, 0), { x: 3, y: 0 });
  assert.equal(cleanScroll(undefined, 1), undefined);
  assert.equal(cleanScroll(1, Number.NaN), undefined);
});

test('the scroll is written into the frame hash and read back', () => {
  const hash = frameHash(CHANNEL, 4567, { x: 0, y: 600 });
  assert.equal(hash, `#kitvas=${CHANNEL}&studio=4567&scroll=0,600`);
  assert.deepEqual(readHash(hash), {
    channel: CHANNEL,
    studioPort: 4567,
    scroll: { x: 0, y: 600 },
  });
  assert.equal(frameHash(CHANNEL, 4567), `#kitvas=${CHANNEL}&studio=4567`);
  const bare = frameHash(CHANNEL, 4567);
  assert.equal(withScroll(bare, { x: 2, y: 9 }), `${bare}&scroll=2,9`);
  assert.equal(withScroll(hash, { x: 1, y: 1 }), `#kitvas=${CHANNEL}&studio=4567&scroll=1,1`);
  assert.equal(withScroll('#other', { x: 1, y: 1 }), '#other');
});

test('a hash with a scroll that is no pair of whole numbers is no channel', () => {
  const base = `#kitvas=${CHANNEL}&studio=4567`;
  const tails = [
    '&scroll=',
    '&scroll=1',
    '&scroll=-1,2',
    '&scroll=1.5,2',
    '&scroll=a,b',
    '&scroll=1,2,3',
    '&scroll=12345678,1',
  ];
  for (const tail of tails) {
    assert.equal(readHash(base + tail), undefined, tail);
  }
});
