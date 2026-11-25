// The lens messages (plan 19, task 1): the pins a page sends and the click a frame reports, each
// read by its own reader, which refuses anything odd as a whole.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isPinKey,
  MAX_PIN_CODE,
  MAX_PIN_KEY,
  MAX_PIN_SMALL,
  MAX_PIN_TEXT,
  MAX_PINS,
  readLensFrame,
  readLensPin,
  readLensStudio,
} from '../../../client/channel/lens-protocol.ts';

const CHANNEL = 'c'.repeat(20);
const ID = 'sections/Plans:section/Stack/Card.2';

const pin = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  key: 'check:f0',
  id: ID,
  kind: 'check',
  tone: 'fix',
  text: 'Text contrast is too low',
  ...over,
});

const studio = (pins: unknown): Record<string, unknown> => ({
  kitvas: 1,
  channel: CHANNEL,
  type: 'lens-pins',
  pins,
});

test('the pins of a lens come through as sent, with the optional parts', () => {
  const card = pin({
    key: 'why:Plans',
    kind: 'why',
    tone: 'plain',
    small: 'The brief names three.',
  });
  const code = pin({ key: 'kit:a:gap', kind: 'kit', tone: 'plain', code: 'gap', text: 'md · 12' });
  const outlined = pin({ key: 'change:0', kind: 'change', tone: 'plain', outline: true });
  assert.deepEqual(readLensStudio(studio([pin(), card, code, outlined]), CHANNEL), {
    kitvas: 1,
    channel: CHANNEL,
    type: 'lens-pins',
    pins: [pin(), card, code, outlined],
  });
  assert.deepEqual(readLensStudio(studio([]), CHANNEL)?.pins, []);
});

test('at most MAX_PINS pins: 201 refuse the whole message', () => {
  const many = (count: number): unknown[] =>
    Array.from({ length: count }, (_, index) => pin({ key: `check:f${index}` }));
  assert.equal(MAX_PINS, 200);
  assert.equal(readLensStudio(studio(many(MAX_PINS)), CHANNEL)?.pins.length, MAX_PINS);
  assert.equal(readLensStudio(studio(many(MAX_PINS + 1)), CHANNEL), undefined);
});

test('a text, a second line, a code word or a key past its limit is refused', () => {
  assert.ok(readLensPin(pin({ text: 'a'.repeat(MAX_PIN_TEXT) })));
  assert.equal(readLensPin(pin({ text: 'a'.repeat(MAX_PIN_TEXT + 1) })), undefined);
  assert.equal(MAX_PIN_TEXT + 1, 81);
  assert.equal(readLensPin(pin({ small: 'a'.repeat(MAX_PIN_SMALL + 1) })), undefined);
  assert.equal(readLensPin(pin({ code: 'a'.repeat(MAX_PIN_CODE + 1) })), undefined);
  assert.equal(readLensPin(pin({ key: 'k'.repeat(MAX_PIN_KEY + 1) })), undefined);
  // Empty words say nothing: a pin needs its text, and a code or a second line is left out instead.
  assert.equal(readLensPin(pin({ text: '' })), undefined);
  assert.equal(readLensPin(pin({ code: '' })), undefined);
  // One bad pin refuses the message, so a frame never draws half of what was meant.
  const long = pin({ key: 'check:f1', text: 'a'.repeat(MAX_PIN_TEXT + 1) });
  assert.equal(readLensStudio(studio([pin(), long]), CHANNEL), undefined);
});

test('an unknown kind or tone, an odd id, key or outline is refused', () => {
  assert.equal(readLensPin(pin({ kind: 'note' })), undefined);
  assert.equal(readLensPin(pin({ tone: 'red' })), undefined);
  assert.equal(readLensPin(pin({ tone: '#ff0000' })), undefined);
  assert.equal(readLensPin(pin({ id: 'a main' })), undefined);
  assert.equal(readLensPin(pin({ id: '' })), undefined);
  assert.equal(readLensPin(pin({ key: 'check f0' })), undefined);
  assert.equal(readLensPin(pin({ key: '<b>' })), undefined);
  assert.equal(readLensPin(pin({ outline: 'yes' })), undefined);
  assert.equal(readLensPin('pin'), undefined);
  assert.equal(readLensPin(null), undefined);
  assert.equal(readLensStudio(studio('pins'), CHANNEL), undefined);
});

test('two pins with one key refuse the message: a click must name one pin', () => {
  assert.equal(readLensStudio(studio([pin(), pin()]), CHANNEL), undefined);
});

test('markup in a text stays text, and a field the protocol does not know is left out', () => {
  const read = readLensPin(pin({ text: '<b>Bold</b> & <img src=x>', style: 'color: red' }));
  assert.equal(read?.text, '<b>Bold</b> & <img src=x>');
  assert.equal(read !== undefined && 'style' in read, false);
});

test('a message on another channel or of another kind is no lens message', () => {
  assert.equal(readLensStudio(studio([pin()]), 'd'.repeat(20)), undefined);
  assert.equal(readLensStudio({ ...studio([pin()]), kitvas: 2 }, CHANNEL), undefined);
  assert.equal(readLensStudio({ ...studio([pin()]), type: 'marks' }, CHANNEL), undefined);
  assert.equal(readLensStudio(null, CHANNEL), undefined);
});

test('a frame reports a click on a pin by its key, and nothing else', () => {
  const click = { kitvas: 1, channel: CHANNEL, type: 'pin', key: 'check:f0' };
  assert.deepEqual(readLensFrame(click, CHANNEL), click);
  assert.deepEqual(readLensFrame({ ...click, id: ID }, CHANNEL), click);
  assert.equal(readLensFrame({ ...click, key: '' }, CHANNEL), undefined);
  assert.equal(readLensFrame({ ...click, key: 3 }, CHANNEL), undefined);
  assert.equal(readLensFrame({ ...click, type: 'pick' }, CHANNEL), undefined);
  assert.equal(readLensFrame({ ...click, channel: 'other' }, CHANNEL), undefined);
  assert.equal(readLensFrame('pin', CHANNEL), undefined);
});

test('every key the page makes is one a pin may carry', () => {
  const made = ['check:f12', 'check:l3.1', 'why:OrderSummary', 'change:4', 'kit:a:ul/$/li:gap'];
  for (const key of made) assert.ok(isPinKey(key), key);
  for (const key of ['', 'why:Order Summary', 'a"b', 'x'.repeat(MAX_PIN_KEY + 1)]) {
    assert.equal(isPinKey(key), false, key);
  }
});
