import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  frameHash,
  MAX_ITEMS,
  MAX_SIZE,
  MAX_STYLE,
  MAX_TEXT,
  parseFrameMessage,
  parseStudioMessage,
  readHash,
  SWAP_STEPS,
} from '../../../client/channel/protocol.ts';

const CHANNEL = 'abcdefghijklmnop';
const OTHER = 'ponmlkjihgfedcba';

/** A message on CHANNEL. */
const sent = (fields: Record<string, unknown>) => ({ kitvas: 1, channel: CHANNEL, ...fields });

const item = (fields: Record<string, unknown> = {}) => ({
  id: 'sections/Hero:section/Button.2',
  width: 120.5,
  height: 40,
  text: 'Buy',
  style: 'color:rgb(0, 0, 0);',
  ...fields,
});
const elements = (items: unknown, request: unknown = 3) =>
  sent({ type: 'elements', request, items });

const mark = (fields: Record<string, unknown> = {}) => ({
  id: 'index:Hero',
  label: '~',
  tone: 'changed',
  ...fields,
});
const marks = (list: unknown) => sent({ type: 'marks', marks: list });

const example = (fields: Record<string, unknown> = {}) =>
  sent({ type: 'example', shown: true, height: 240, ...fields });

test('the hash round-trips and carries the channel and the studio port', () => {
  assert.equal(frameHash(CHANNEL, 4567), `#kitvas=${CHANNEL}&studio=4567`);
  assert.deepEqual(readHash(frameHash(CHANNEL, 4567)), { channel: CHANNEL, studioPort: 4567 });
  assert.deepEqual(readHash(frameHash(CHANNEL, 1)), { channel: CHANNEL, studioPort: 1 });
  const longest = `${'a'.repeat(62)}_-`;
  assert.deepEqual(readHash(frameHash(longest, 65535)), { channel: longest, studioPort: 65535 });
});

test('any other hash is no channel', () => {
  const refused = [
    '',
    '#',
    `kitvas=${CHANNEL}&studio=4567`,
    `#kitvas=${'a'.repeat(15)}&studio=4567`,
    `#kitvas=${'a'.repeat(65)}&studio=4567`,
    '#kitvas=abcdefghijklmno+&studio=4567',
    '#kitvas=abcdefghijklmno=&studio=4567',
    `#kitvas=${CHANNEL}&studio=0`,
    `#kitvas=${CHANNEL}&studio=04567`,
    `#kitvas=${CHANNEL}&studio=65536`,
    `#kitvas=${CHANNEL}&studio=99999`,
    `#kitvas=${CHANNEL}&studio=123456`,
    `#kitvas=${CHANNEL}&studio=4567&x=1`,
    `#studio=4567&kitvas=${CHANNEL}`,
    `#kitvas=${CHANNEL}`,
    `#KITVAS=${CHANNEL}&studio=4567`,
  ];
  for (const hash of refused) assert.equal(readHash(hash), undefined, hash);
});

test('the studio takes ready and shown from its channel', () => {
  const ready = parseFrameMessage(sent({ type: 'ready', state: 'filled' }), CHANNEL);
  assert.deepEqual(ready, { kitvas: 1, channel: CHANNEL, type: 'ready', state: 'filled' });
  const shown = parseFrameMessage(sent({ type: 'shown', state: 'a' }), CHANNEL);
  assert.deepEqual(shown, { kitvas: 1, channel: CHANNEL, type: 'shown', state: 'a' });
  const longState = `a${'b-1'.repeat(20)}xy`;
  assert.equal(longState.length, 63);
  assert.ok(parseFrameMessage(sent({ type: 'shown', state: longState }), CHANNEL));
});

test('the studio takes a ready that answers a swap, with the build it names', () => {
  const ready = parseFrameMessage(sent({ type: 'ready', state: 'filled', live: 4 }), CHANNEL);
  assert.deepEqual(ready, { kitvas: 1, channel: CHANNEL, type: 'ready', state: 'filled', live: 4 });
  assert.ok(parseFrameMessage(sent({ type: 'ready', state: 'filled', live: 0 }), CHANNEL));
  assert.ok(parseFrameMessage(sent({ type: 'ready', state: 'filled', live: 1e9 }), CHANNEL));
  // `shown` names no build: the field goes like any other it does not know.
  const shown = parseFrameMessage(sent({ type: 'shown', state: 'a', live: 4 }), CHANNEL);
  assert.deepEqual(shown, { kitvas: 1, channel: CHANNEL, type: 'shown', state: 'a' });
});

test('the studio takes every step of a swap from its channel, and only its known fields', () => {
  assert.deepEqual([...SWAP_STEPS], ['held', 'free', 'failed']);
  for (const step of SWAP_STEPS) {
    const parsed = parseFrameMessage(sent({ type: 'swap', live: 7, step, state: 'a' }), CHANNEL);
    assert.deepEqual(parsed, { kitvas: 1, channel: CHANNEL, type: 'swap', live: 7, step });
  }
});

test('the studio refuses an answer to a swap it cannot trust', () => {
  const ready = (live: unknown) => sent({ type: 'ready', state: 'filled', live });
  const swap = (fields: Record<string, unknown>) => sent({ type: 'swap', ...fields });
  const refused: [string, unknown][] = [
    ['ready with a build as text', ready('4')],
    ['ready with a negative build', ready(-1)],
    ['ready with a fractional build', ready(1.5)],
    ['ready with a build too large', ready(1e9 + 1)],
    ['ready with a build that is null', ready(null)],
    ['a swap with no step', swap({ live: 1 })],
    ['a swap with a step it does not know', swap({ live: 1, step: 'ready' })],
    ['a swap with a step that is no text', swap({ live: 1, step: 1 })],
    ['a swap with no build', swap({ step: 'failed' })],
    ['a swap with a build as text', swap({ live: '1', step: 'failed' })],
    ['a swap with a fractional build', swap({ live: 0.5, step: 'held' })],
    ['a swap on another channel', { ...swap({ live: 1, step: 'free' }), channel: OTHER }],
  ];
  for (const [name, data] of refused) {
    assert.equal(parseFrameMessage(data, CHANNEL), undefined, name);
  }
});

test('the studio takes elements from its channel, up to the limits', () => {
  const parsed = parseFrameMessage(elements([item()]), CHANNEL);
  assert.deepEqual(parsed, {
    kitvas: 1,
    channel: CHANNEL,
    type: 'elements',
    request: 3,
    items: [item()],
  });
  assert.ok(parseFrameMessage(elements([], 0), CHANNEL));
  assert.ok(parseFrameMessage(elements([], 1e9), CHANNEL));
  const full = Array.from({ length: MAX_ITEMS }, () => item());
  assert.equal(parseFrameMessage(elements(full), CHANNEL)?.type, 'elements');
  const edges = item({
    width: 0,
    height: 1e6,
    text: 'x'.repeat(MAX_TEXT),
    style: 's'.repeat(MAX_STYLE),
  });
  assert.ok(parseFrameMessage(elements([edges]), CHANNEL));
});

test('the studio takes example from its channel, shown or not, up to the size limit', () => {
  const base = { kitvas: 1, channel: CHANNEL, type: 'example' };
  assert.deepEqual(parseFrameMessage(example(), CHANNEL), { ...base, shown: true, height: 240 });
  const none = parseFrameMessage(example({ shown: false, height: 0 }), CHANNEL);
  assert.deepEqual(none, { ...base, shown: false, height: 0 });
  assert.equal(MAX_SIZE, 1e6);
  assert.ok(parseFrameMessage(example({ height: MAX_SIZE }), CHANNEL));
  assert.ok(parseFrameMessage(example({ height: 120.5 }), CHANNEL));
  const trimmed = parseFrameMessage(example({ html: '<b>x</b>', key: 'Button.1' }), CHANNEL);
  assert.deepEqual(trimmed, { ...base, shown: true, height: 240 });
});

test('the studio refuses an example it cannot trust', () => {
  const refused: [string, unknown][] = [
    ['another channel', { ...example(), channel: OTHER }],
    ['kitvas 2', { ...example(), kitvas: 2 }],
    ['shown as text', example({ shown: 'true' })],
    ['shown as a number', example({ shown: 1 })],
    ['no shown', example({ shown: undefined })],
    ['no height', example({ height: undefined })],
    ['a negative height', example({ height: -1 })],
    ['a height too large', example({ height: MAX_SIZE + 1 })],
    ['a height that is not a number', example({ height: Number.NaN })],
    ['an endless height', example({ height: Number.POSITIVE_INFINITY })],
    ['a height as text', example({ height: '240' })],
  ];
  for (const [name, data] of refused) {
    assert.equal(parseFrameMessage(data, CHANNEL), undefined, name);
  }
  assert.equal(parseStudioMessage(example(), CHANNEL), undefined, 'a frame refuses example');
});

test('what the studio takes keeps only the known fields', () => {
  const data = sent({ type: 'elements', request: 1, items: [item({ html: '<b>' })], extra: true });
  const parsed = parseFrameMessage(data, CHANNEL);
  assert.deepEqual(parsed, {
    kitvas: 1,
    channel: CHANNEL,
    type: 'elements',
    request: 1,
    items: [item()],
  });
});

test('the studio refuses anything else a frame sends', () => {
  const refused: [string, unknown][] = [
    ['null', null],
    ['a string', 'ready'],
    ['a number', 1],
    ['an array', [sent({ type: 'ready', state: 'filled' })]],
    ['another channel', { kitvas: 1, channel: OTHER, type: 'ready', state: 'filled' }],
    ['no channel', { kitvas: 1, type: 'ready', state: 'filled' }],
    ['kitvas 2', { kitvas: 2, channel: CHANNEL, type: 'ready', state: 'filled' }],
    ['kitvas as text', { kitvas: '1', channel: CHANNEL, type: 'ready', state: 'filled' }],
    ['no type', sent({ state: 'filled' })],
    ['an unknown type', sent({ type: 'hello', state: 'filled' })],
    ['a studio message', sent({ type: 'measure', request: 1 })],
    ['a state with capitals', sent({ type: 'ready', state: 'Filled' })],
    ['a state that starts with a digit', sent({ type: 'ready', state: '1st' })],
    ['a state of 64 characters', sent({ type: 'shown', state: 'a'.repeat(64) })],
    ['a state that is no text', sent({ type: 'shown', state: 7 })],
    ['no state', sent({ type: 'ready' })],
    ['items that are no list', elements({ 0: item() })],
    ['too many items', elements(Array.from({ length: MAX_ITEMS + 1 }, () => item()))],
    ['a negative request', elements([], -1)],
    ['a fractional request', elements([], 1.5)],
    ['a request too large', elements([], 1e9 + 1)],
    ['a request as text', elements([], '1')],
    ['an item that is null', elements([null])],
    ['an item that is a list', elements([[item()]])],
    ['an empty id', elements([item({ id: '' })])],
    ['an id with a space', elements([item({ id: 'index:Hero main' })])],
    ['an id with a quote', elements([item({ id: 'index:"Hero' })])],
    ['an id of 201 characters', elements([item({ id: 'a'.repeat(201) })])],
    ['a negative width', elements([item({ width: -1 })])],
    ['a width that is not a number', elements([item({ width: Number.NaN })])],
    ['an endless height', elements([item({ height: Number.POSITIVE_INFINITY })])],
    ['a height too large', elements([item({ height: 1e6 + 1 })])],
    ['a size as text', elements([item({ width: '10' })])],
    ['text too long', elements([item({ text: 'x'.repeat(MAX_TEXT + 1) })])],
    ['style too long', elements([item({ style: 's'.repeat(MAX_STYLE + 1) })])],
    ['no text', elements([item({ text: undefined })])],
    ['one bad item among good ones', elements([item(), item({ id: '' }), item()])],
  ];
  for (const [name, data] of refused) {
    assert.equal(parseFrameMessage(data, CHANNEL), undefined, name);
  }
});

test('a frame takes measure and state from its channel', () => {
  const measure = parseStudioMessage(sent({ type: 'measure', request: 9 }), CHANNEL);
  assert.deepEqual(measure, { kitvas: 1, channel: CHANNEL, type: 'measure', request: 9 });
  const state = parseStudioMessage(sent({ type: 'state', state: 'empty' }), CHANNEL);
  assert.deepEqual(state, { kitvas: 1, channel: CHANNEL, type: 'state', state: 'empty' });
});

test('a frame takes swap from its channel: a whole build number and nothing else', () => {
  const swap = parseStudioMessage(sent({ type: 'swap', live: 3, step: 'failed' }), CHANNEL);
  assert.deepEqual(swap, { kitvas: 1, channel: CHANNEL, type: 'swap', live: 3 });
  assert.ok(parseStudioMessage(sent({ type: 'swap', live: 0 }), CHANNEL));
  const refused: [string, unknown][] = [
    ['no build', sent({ type: 'swap' })],
    ['a negative build', sent({ type: 'swap', live: -1 })],
    ['a fractional build', sent({ type: 'swap', live: 1.5 })],
    ['a build as text', sent({ type: 'swap', live: '3' })],
    ['a build too large', sent({ type: 'swap', live: 1e9 + 1 })],
    ['another channel', { kitvas: 1, channel: OTHER, type: 'swap', live: 3 }],
  ];
  for (const [name, data] of refused) {
    assert.equal(parseStudioMessage(data, CHANNEL), undefined, name);
  }
});

test('a frame takes marks of every tone, and only their known fields', () => {
  const list = [
    mark(),
    mark({ label: '12' }),
    mark({ tone: 'added', label: '+', id: 'sections/Hero:section/p' }),
    mark({ label: '12345678' }),
  ];
  const parsed = parseStudioMessage(marks(list), CHANNEL);
  assert.deepEqual(parsed, { kitvas: 1, channel: CHANNEL, type: 'marks', marks: list });
  assert.ok(parseStudioMessage(marks([]), CHANNEL));
  assert.ok(parseStudioMessage(marks(Array.from({ length: MAX_ITEMS }, () => mark())), CHANNEL));
  const trimmed = parseStudioMessage(marks([mark({ note: 'x' })]), CHANNEL);
  assert.deepEqual(trimmed, { kitvas: 1, channel: CHANNEL, type: 'marks', marks: [mark()] });
});

test('a frame refuses anything else the studio sends', () => {
  const refused: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['an array', [sent({ type: 'measure', request: 1 })]],
    ['another channel', { kitvas: 1, channel: OTHER, type: 'measure', request: 1 }],
    ['kitvas 2', { kitvas: 2, channel: CHANNEL, type: 'measure', request: 1 }],
    ['a frame message', sent({ type: 'ready', state: 'filled' })],
    ['elements', elements([item()])],
    ['an unknown type', sent({ type: 'reload' })],
    ['a negative request', sent({ type: 'measure', request: -1 })],
    ['a fractional request', sent({ type: 'measure', request: 0.5 })],
    ['no request', sent({ type: 'measure' })],
    ['a bad state', sent({ type: 'state', state: 'Empty' })],
    ['a state of 64 characters', sent({ type: 'state', state: 'a'.repeat(64) })],
    ['no state', sent({ type: 'state' })],
    ['marks that are no list', marks(mark())],
    ['too many marks', marks(Array.from({ length: MAX_ITEMS + 1 }, () => mark()))],
    ['a mark that is null', marks([null])],
    ['a bad tone', marks([mark({ tone: 'error' })])],
    ['no tone', marks([mark({ tone: undefined })])],
    ['a label too long', marks([mark({ label: '123456789' })])],
    ['a label that is no text', marks([mark({ label: 1 })])],
    ['a bad id', marks([mark({ id: 'index:Hero main' })])],
    ['an empty id', marks([mark({ id: '' })])],
    ['one bad mark among good ones', marks([mark(), mark({ tone: 'info' })])],
  ];
  for (const [name, data] of refused) {
    assert.equal(parseStudioMessage(data, CHANNEL), undefined, name);
  }
});
