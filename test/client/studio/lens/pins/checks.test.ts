// The Checks lens's pins (plan 19, task 1): one per finding of the full check and of the live check
// at the card's width, in its tone, with its short name; nothing for a finding of no element.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PIN_TEXT, readLensPin } from '../../../../../client/channel/lens-protocol.ts';
import type { LiveGroup, LiveRow } from '../../../../../client/studio/edit/live/items.ts';
import {
  checkCount,
  checkPins,
  type FullFinding,
} from '../../../../../client/studio/lens/pins/checks.ts';
import { LENS_TEXTS, seedTexts } from '../texts.ts';

seedTexts(LENS_TEXTS);

const BUTTON = 'sections/Plans:section/Stack/Card.2/Button';
const PRICE = 'sections/Plans:section/Stack/Card/Price';

const AXE =
  'Element has insufficient color contrast of 3.9 (foreground color: #8e949e, background color: ' +
  '#ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1';

const full = (index: number, over: Partial<FullFinding> = {}): FullFinding => ({
  index,
  element: BUTTON,
  tone: 'fix',
  rule: 'ds/spacing',
  message: 'Gap 13px is not a spacing token',
  hint: '',
  ...over,
});

const row = (over: Partial<LiveRow> = {}): LiveRow => ({
  rule: 'a11y/target-size',
  severity: 'review',
  message: 'The target is 20 × 20 px, smaller than 24 × 24 px.',
  source: 'frame',
  widths: [390],
  waived: false,
  evidence: { kind: 'target', width: 20, height: 20, min: 24 },
  values: { width: 20, height: 20 },
  ...over,
});

const group = (id: string | null, rows: LiveRow[]): LiveGroup => ({
  id,
  label: id === null ? null : 'L1',
  tone: 'review',
  rows,
});

test('a pin per finding of the full check on an element, in its tone, with its short name', () => {
  const findings = [
    full(0, { rule: 'a11y/color-contrast', hint: AXE, element: PRICE }),
    full(1, { element: null }),
    full(2, { tone: 'review' }),
    full(3, { tone: null }),
  ];
  assert.deepEqual(checkPins(findings, [], 1280), [
    {
      key: 'check:f0',
      id: PRICE,
      kind: 'check',
      tone: 'fix',
      text: 'Text contrast is too low',
    },
    {
      key: 'check:f2',
      id: BUTTON,
      kind: 'check',
      tone: 'review',
      text: 'Gap 13px is not a spacing token',
    },
  ]);
});

test('a live finding is pinned on the card of the width it was measured at', () => {
  const live = [
    group(BUTTON, [row(), row({ widths: [1280], severity: 'fix', message: 'Too narrow' })]),
    group(PRICE, [
      row({ source: 'code', widths: [], evidence: { kind: 'message', message: 'x' } }),
    ]),
  ];
  const phone = checkPins([], live, 390);
  assert.deepEqual(
    phone.map((pin) => [pin.key, pin.id, pin.tone, pin.text]),
    [
      ['check:l0.0', BUTTON, 'review', 'The target is too small'],
      // A code finding holds at every width, and is named by its own words.
      ['check:l1.0', PRICE, 'review', 'The target is 20 × 20 px, smaller than 24 × 24 px.'],
    ],
  );
  const desktop = checkPins([], live, 1280);
  assert.deepEqual(
    desktop.map((pin) => pin.key),
    ['check:l0.1', 'check:l1.0'],
  );
});

test('an accepted live finding and one of no element get no pin', () => {
  const live = [group(BUTTON, [row({ waived: true })]), group(null, [row()])];
  assert.deepEqual(checkPins([], live, 390), []);
});

test('the full findings come before the live ones, and every pin is one a frame takes', () => {
  const pins = checkPins([full(0)], [group(BUTTON, [row()])], 390);
  assert.deepEqual(
    pins.map((pin) => pin.key),
    ['check:f0', 'check:l0.0'],
  );
  for (const pin of pins) assert.deepEqual(readLensPin(pin), pin);
});

test('a long message is cut to the pin text limit, and an empty one shows its rule', () => {
  const [long] = checkPins([full(0, { message: 'word '.repeat(40) })], [], 1280);
  assert.equal(long?.text.length, MAX_PIN_TEXT);
  assert.ok(long?.text.endsWith('…'));
  const [bare] = checkPins([full(0, { message: '  ' })], [], 1280);
  assert.equal(bare?.text, 'ds/spacing');
});

test('the count is every finding the pane lists and every live one not accepted', () => {
  const live = [group(BUTTON, [row(), row({ waived: true })]), group(null, [row()])];
  assert.equal(checkCount([full(0), full(1, { element: null })], live), 4);
  assert.equal(checkCount([], []), 0);
});
