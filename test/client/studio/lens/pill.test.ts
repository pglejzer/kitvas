// The lens pill (plan 19, task 1): one pressed button, counts on Checks and Changes, Kit and Changes
// off outside Edit with a title that says why, and the left-out pins on the pressed button's title.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buttonViews, type PillView } from '../../../../client/studio/lens/pill.ts';
import { LENS_TEXTS, seedTexts } from './texts.ts';

seedTexts(LENS_TEXTS);

const view = (over: Partial<PillView> = {}): PillView => ({
  lens: 'design',
  editing: true,
  counts: { checks: 2, changes: 3 },
  left: 0,
  ...over,
});

test('five buttons, the lens that is on pressed, counts on Checks and Changes only', () => {
  const buttons = buttonViews(view({ lens: 'checks' }));
  assert.deepEqual(
    buttons.map((one) => [one.id, one.label, one.pressed, one.count]),
    [
      ['design', 'Design', false, ''],
      ['kit', 'Kit', false, ''],
      ['checks', 'Checks', true, '2'],
      ['why', 'Why', false, ''],
      ['changes', 'Changes', false, '3'],
    ],
  );
  assert.ok(buttons.every((one) => !one.off && one.title === ''));
});

test('a count of none shows nothing', () => {
  const buttons = buttonViews(view({ counts: { checks: 0, changes: 0 } }));
  assert.ok(buttons.every((one) => one.count === ''));
});

test('outside Edit Kit and Changes are off and say why', () => {
  const buttons = buttonViews(view({ editing: false }));
  const off = buttons.filter((one) => one.off);
  assert.deepEqual(
    off.map((one) => [one.id, one.title]),
    [
      ['kit', 'Kit needs Edit. Turn Edit on to use it.'],
      ['changes', 'Changes needs Edit. Turn Edit on to use it.'],
    ],
  );
  // An off lens is never shown pressed, even for the moment before the page goes back to Design.
  assert.ok(!buttonViews(view({ editing: false, lens: 'kit' })).some((one) => one.pressed));
});

test('pins left out past the limit are named on the pressed button only', () => {
  const buttons = buttonViews(view({ lens: 'checks', left: 37 }));
  const titled = buttons.filter((one) => one.title !== '');
  assert.deepEqual(
    titled.map((one) => [one.id, one.title]),
    [['checks', '37 more pins are not drawn: the canvas shows 200 at most.']],
  );
});
