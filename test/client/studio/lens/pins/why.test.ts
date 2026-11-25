// The Why lens's pins (plan 19, task 1): a card pin per section with reasons, on its element, with
// the first line's lead; "No reasons yet" for a section with an element and no reasons; nothing for
// a section the reasons name no element for.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLensPin } from '../../../../../client/channel/lens-protocol.ts';
import type { WhyReport, WhySection } from '../../../../../client/studio/edit/why/entries.ts';
import { whyKey, whyPins } from '../../../../../client/studio/lens/pins/why.ts';
import { LENS_TEXTS, seedTexts } from '../texts.ts';

seedTexts(LENS_TEXTS);

const section = (name: string, over: Partial<WhySection> = {}): WhySection => ({
  section: name,
  element: `sections/${name}:section`,
  lines: [],
  guidelines: [],
  stale: false,
  ...over,
});

test('a section with reasons gets a card pin: the lead in bold, the rest as its second line', () => {
  const report: WhyReport = {
    sections: [
      section('Pricing', {
        lines: ['Three plans. The brief names three audiences: one person, a team, a company.'],
      }),
    ],
    missing: [],
  };
  assert.deepEqual(whyPins(report, []), [
    {
      key: 'why:Pricing',
      id: 'sections/Pricing:section',
      kind: 'why',
      tone: 'plain',
      text: 'Three plans.',
      small: 'The brief names three audiences: one person, a team, a company.',
    },
  ]);
});

test('a first line without a lead is the second line, under the section name', () => {
  const report: WhyReport = { sections: [section('Hero', { lines: ['Short line'] })], missing: [] };
  const [pin] = whyPins(report, []);
  assert.equal(pin?.text, 'Hero');
  assert.equal(pin?.small, 'Short line');
});

test('a section with an element and no reasons says so; one with no element has no pin', () => {
  const report: WhyReport = {
    sections: [section('Footer', { element: null, lines: ['Links last.'] })],
    missing: ['OrderSummary', 'Faq'],
  };
  const layout = [
    { id: 'order-summary', element: 'sections/OrderSummary:section' },
    { id: 'faq', element: null },
    { id: 'footer', element: 'sections/Footer:section' },
  ];
  assert.deepEqual(whyPins(report, layout), [
    {
      key: 'why:OrderSummary',
      id: 'sections/OrderSummary:section',
      kind: 'why',
      tone: 'plain',
      text: 'No reasons yet',
    },
  ]);
});

test('a written section whose lines are all empty has no reasons yet', () => {
  const report: WhyReport = { sections: [section('Hero', { lines: ['  '] })], missing: [] };
  assert.deepEqual(
    whyPins(report, [{ id: 'hero', element: 'sections/Hero:section' }]).map((pin) => pin.text),
    ['No reasons yet'],
  );
});

test('long reasons are cut, and every pin is one a frame takes', () => {
  const long = `${'A lead that runs on and on '.repeat(4)}. ${'More words follow here. '.repeat(10)}`;
  const report: WhyReport = { sections: [section('Pricing', { lines: [long] })], missing: [] };
  const pins = whyPins(report, []);
  assert.equal(pins.length, 1);
  for (const pin of pins) assert.deepEqual(readLensPin(pin), pin);
});

test('a section name no key can carry gets a numbered key', () => {
  assert.equal(whyKey('OrderSummary', 0), 'why:OrderSummary');
  assert.equal(whyKey('Order Summary', 3), 'why#3');
});
