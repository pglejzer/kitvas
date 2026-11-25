// The Changes lens's pins (plan 19, task 1): one outlined pin per changed element, with who changed
// it and what, or how many changes; none for a change to a whole file.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PIN_TEXT, readLensPin } from '../../../../../client/channel/lens-protocol.ts';
import type { ChangeEntry } from '../../../../../client/studio/edit/store.ts';
import { changePins } from '../../../../../client/studio/lens/pins/changes.ts';
import { LENS_TEXTS, seedTexts } from '../texts.ts';

seedTexts(LENS_TEXTS);

const BUTTON = 'sections/Plans:section/Stack/Card.2/Button';
const CARD = 'sections/Plans:section/Stack/Card.2';

const change = (over: Partial<ChangeEntry> = {}): ChangeEntry => ({
  by: 'person',
  id: BUTTON,
  label: 'Set size',
  files: [],
  offKit: false,
  at: 1,
  ...over,
});

test('one change says who made it and what it did, with the element outlined', () => {
  assert.deepEqual(changePins([change({ before: 'md', after: 'lg' })]), [
    {
      key: 'change:0',
      id: BUTTON,
      kind: 'change',
      tone: 'plain',
      text: 'You · Set size: md → lg',
      outline: true,
    },
  ]);
  const claude = change({ by: 'claude', id: CARD, label: 'Padding lg to xl', files: ['a.scss'] });
  assert.equal(changePins([claude])[0]?.text, 'Claude · Padding lg to xl');
});

test('several changes of one element are one pin with their count', () => {
  const pins = changePins([change(), change({ at: 2 }), change({ at: 3 }), change({ id: CARD })]);
  assert.deepEqual(
    pins.map((pin) => [pin.key, pin.id, pin.text]),
    [
      ['change:0', BUTTON, 'You · 3 changes'],
      ['change:1', CARD, 'You · Set size'],
    ],
  );
  const both = changePins([change(), change({ by: 'claude', at: 2 })]);
  assert.equal(both[0]?.text, 'You and Claude · 2 changes');
});

test('a change to a whole file names no element and has no pin', () => {
  assert.deepEqual(changePins([change({ by: 'claude', id: null, files: ['src/a.tsx'] })]), []);
  assert.deepEqual(changePins([]), []);
});

test('a long label is cut, and every pin is one a frame takes', () => {
  const pins = changePins([change({ by: 'claude', label: 'A reason Claude wrote. '.repeat(10) })]);
  assert.equal(pins[0]?.text.length, MAX_PIN_TEXT);
  for (const pin of pins) assert.deepEqual(readLensPin(pin), pin);
});
