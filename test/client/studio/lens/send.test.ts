// What the lens that is on sends each card (plan 19, task 1): nothing in Design, the Checks lens's
// pins and no numbered dots, nothing of Kit or Changes outside Edit; bad pins left out, at most
// MAX_PINS with the count of the rest, and a card is sent its pins once.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type LensPin, MAX_PINS } from '../../../../client/channel/lens-protocol.ts';
import { pageMarks } from '../../../../client/studio/draft/marks.ts';
import type { LiveGroup } from '../../../../client/studio/edit/live/items.ts';
import type { ChangeEntry } from '../../../../client/studio/edit/store.ts';
import type { Frame } from '../../../../client/studio/frames.ts';
import { LENSES } from '../../../../client/studio/lens/lens.ts';
import type { FullFinding } from '../../../../client/studio/lens/pins/checks.ts';
import {
  capPins,
  cleanPins,
  createSender,
  type LensSources,
  lensCounts,
  lensPins,
} from '../../../../client/studio/lens/send.ts';
import { LENS_TEXTS, seedTexts } from './texts.ts';

seedTexts(LENS_TEXTS);

const ID = 'sections/Plans:section/Stack/Card.2';

const finding: FullFinding = {
  index: 0,
  element: ID,
  tone: 'fix',
  rule: 'ds/spacing',
  message: 'Gap 13px is not a spacing token',
  hint: '',
};

const live: LiveGroup[] = [
  {
    id: ID,
    label: 'L1',
    tone: 'review',
    rows: [
      {
        rule: 'live/overflow',
        severity: 'review',
        message: 'The content is wider than its box',
        source: 'code',
        widths: [],
        waived: false,
        evidence: { kind: 'message', message: 'The content is wider than its box' },
        values: null,
      },
    ],
  },
];

const change: ChangeEntry = {
  by: 'person',
  id: ID,
  label: 'Set gap',
  files: [],
  offKit: false,
  at: 1,
};

const kit: LensPin = {
  key: 'kit:a:gap',
  id: ID,
  kind: 'kit',
  tone: 'plain',
  code: 'gap',
  text: 'space-md · 12',
};

const sources: LensSources = {
  findings: [finding],
  live,
  why: { sections: [], missing: [] },
  sections: [],
  changes: [change],
  kit: [kit],
};

const diff = { changed: [ID], added: [], removed: [] };

test('Design sends no pins, in Preview and in Edit', () => {
  assert.deepEqual(lensPins('design', true, sources, 1280), []);
  assert.deepEqual(lensPins('design', false, sources, 1280), []);
});

test('the Checks lens sends a pin per finding, and the page sends no numbered dots', () => {
  const pins = lensPins('checks', true, sources, 1280);
  assert.deepEqual(
    pins.map((pin) => [pin.key, pin.kind, pin.tone]),
    [
      ['check:f0', 'check', 'fix'],
      ['check:l0.0', 'check', 'review'],
    ],
  );
  // The only marks the page still sends are compare's outlines, the same in every lens.
  assert.deepEqual(pageMarks(undefined), []);
  assert.deepEqual(
    pageMarks(diff).map((mark) => mark.tone),
    ['changed'],
  );
});

test('every lens but Checks sends no check pin', () => {
  for (const lens of LENSES.filter((one) => one !== 'checks')) {
    const pins = lensPins(lens, true, sources, 1280);
    assert.ok(
      pins.every((pin) => pin.kind !== 'check'),
      lens,
    );
  }
});

test('Kit and Changes send their pins in Edit and none in Preview', () => {
  assert.deepEqual(lensPins('kit', true, sources, 1280), [kit]);
  assert.equal(lensPins('changes', true, sources, 1280)[0]?.text, 'You · Set gap');
  assert.deepEqual(lensPins('kit', false, sources, 1280), []);
  assert.deepEqual(lensPins('changes', false, sources, 1280), []);
  // Why works in Preview; with its report not read yet it has nothing to say.
  assert.deepEqual(lensPins('why', false, { ...sources, why: null }, 1280), []);
});

test('a pin the frame would refuse, or a second pin with one key, is left out alone', () => {
  const bad: LensPin = { ...kit, key: 'kit:b', id: 'not an id' };
  const twice: LensPin = { ...kit, text: 'again' };
  assert.deepEqual(cleanPins([kit, bad, twice]), [kit]);
});

test('at most MAX_PINS go to a card, and the pill hears how many were left out', () => {
  const many = Array.from({ length: MAX_PINS + 37 }, (_, index) => ({
    ...kit,
    key: `kit:${index}`,
  }));
  const capped = capPins(many);
  assert.equal(capped.pins.length, MAX_PINS);
  assert.equal(capped.left, 37);
  assert.deepEqual(capped.pins[0], many[0]);
  assert.deepEqual(capPins([kit]), { pins: [kit], left: 0 });
});

test('a card is sent its pins once, and again after it lost them', () => {
  const posted: [string, number][] = [];
  const sender = createSender((frame, pins) => posted.push([frame.channel, pins.length]));
  const frame = { channel: 'one' } as unknown as Frame;
  const other = { channel: 'two' } as unknown as Frame;
  sender.send(frame, [kit]);
  sender.send(frame, [kit]);
  sender.send(other, [kit]);
  sender.send(frame, []);
  sender.forget(frame);
  sender.send(frame, []);
  assert.deepEqual(posted, [
    ['one', 1],
    ['two', 1],
    ['one', 0],
    ['one', 0],
  ]);
});

test('the pill counts the findings listed and the session changes', () => {
  assert.deepEqual(lensCounts({ findings: [finding], live, changes: [change, change] }), {
    checks: 2,
    changes: 2,
  });
  assert.deepEqual(lensCounts({ findings: [], live: [], changes: [] }), { checks: 0, changes: 0 });
});
