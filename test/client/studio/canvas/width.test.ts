import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chooseWidth,
  clampView,
  dragWidth,
  frameHeight,
  MAX_VIEW,
  MIN_VIEW,
  PRESETS,
  parseView,
  presetOf,
  readShown,
  type Shown,
  SNAP,
  sameShown,
  shownWidth,
  snapToPreset,
  stepView,
  widthAddress,
} from '../../../../client/studio/canvas/width.ts';
import {
  MAX_VIEW as SERVER_MAX,
  MIN_VIEW as SERVER_MIN,
  WIDTHS,
} from '../../../../src/studio/views/draft-query.ts';

const PHONE: Shown = { width: 390, view: null };
const PAGE = 'http://127.0.0.1:5000/drafts/shop?version=3&state=empty&width=390';

test('the page keeps the same presets and range as the server', () => {
  assert.deepEqual([...PRESETS], [...WIDTHS]);
  assert.equal(MIN_VIEW, SERVER_MIN);
  assert.equal(MAX_VIEW, SERVER_MAX);
});

test('a width is a whole number from 320 to 2560', () => {
  assert.equal(clampView(1000), 1000);
  assert.equal(clampView(999.6), 1000);
  assert.equal(clampView(10), MIN_VIEW);
  assert.equal(clampView(99_999), MAX_VIEW);
  assert.equal(clampView(Number.NaN), MIN_VIEW);
});

test('a typed width is digits only, cut to the range', () => {
  assert.equal(parseView('1000'), 1000);
  assert.equal(parseView(' 768 '), 768);
  assert.equal(parseView('5'), MIN_VIEW);
  assert.equal(parseView('99999'), MAX_VIEW);
  for (const typed of ['', 'wide', '10.5', '-400', '1e3', '123456', null, undefined]) {
    assert.equal(parseView(typed), null, String(typed));
  }
});

test('the three presets are presets and nothing else is', () => {
  for (const width of WIDTHS) assert.equal(presetOf(width), width);
  for (const width of [320, 391, 1024, 2560, Number.NaN]) assert.equal(presetOf(width), null);
});

test('choosing a preset shows it and drops the custom width', () => {
  assert.deepEqual(chooseWidth({ width: 390, view: 1000 }, 768), { width: 768, view: null });
  assert.deepEqual(chooseWidth(PHONE, 390), PHONE);
});

test('choosing any other width keeps the preset the checks belong to', () => {
  assert.deepEqual(chooseWidth(PHONE, 1000), { width: 390, view: 1000 });
  assert.deepEqual(chooseWidth({ width: 1280, view: 1000 }, 1001), { width: 1280, view: 1001 });
  // Out of range it is cut, and may land on no preset.
  assert.deepEqual(chooseWidth(PHONE, 100), { width: 390, view: 320 });
  assert.deepEqual(chooseWidth(PHONE, 9000), { width: 390, view: 2560 });
});

test('what is shown is the custom width when there is one, else the preset', () => {
  assert.equal(shownWidth(PHONE), 390);
  assert.equal(shownWidth({ width: 390, view: 1000 }), 1000);
  assert.ok(sameShown(PHONE, { width: 390, view: null }));
  assert.ok(!sameShown(PHONE, { width: 390, view: 400 }));
  assert.ok(!sameShown(PHONE, { width: 768, view: null }));
});

test('a page starts with the width and the view its markup or address names', () => {
  assert.deepEqual(readShown('768', undefined), { width: 768, view: null });
  assert.deepEqual(readShown('768', '1000'), { width: 768, view: 1000 });
  assert.deepEqual(readShown(undefined, null), PHONE);
  assert.deepEqual(readShown('1024', 'wide'), PHONE);
  // A preset named as a view is that preset.
  assert.deepEqual(readShown('390', '1280'), { width: 1280, view: null });
});

test('arrows step one pixel, with Shift ten, and stop at the ends', () => {
  assert.equal(stepView(1000, 1, false), 1001);
  assert.equal(stepView(1000, -1, false), 999);
  assert.equal(stepView(1000, 1, true), 1010);
  assert.equal(stepView(1000, -1, true), 990);
  assert.equal(stepView(MAX_VIEW, 1, true), MAX_VIEW);
  assert.equal(stepView(MIN_VIEW, -1, false), MIN_VIEW);
});

test('a drag that ends near a preset lands on it', () => {
  assert.equal(snapToPreset(390 + SNAP), 390);
  assert.equal(snapToPreset(768 - SNAP), 768);
  assert.equal(snapToPreset(1283), 1280);
  assert.equal(snapToPreset(390 + SNAP + 1), 390 + SNAP + 1);
  assert.equal(snapToPreset(1000), 1000);
});

test('the handle moves a centred card two pixels of width for each pixel of the pointer', () => {
  assert.equal(dragWidth(1000, 50, 1, true), 1100);
  assert.equal(dragWidth(1000, -50, 1, true), 900);
});

test('a card that does not fit the canvas grows to one side, one for one', () => {
  assert.equal(dragWidth(1000, 50, 1, false), 1050);
});

test('the handle follows the pointer at any zoom', () => {
  // At 50 % a pixel of the pointer is two of the card.
  assert.equal(dragWidth(1000, 50, 0.5, false), 1100);
  assert.equal(dragWidth(1000, 50, 0.5, true), 1200);
  assert.equal(dragWidth(1000, 50, 2, false), 1025);
  assert.equal(dragWidth(1000, 50, 0, false), 1050);
});

test('a drag never leaves the range', () => {
  assert.equal(dragWidth(400, -5000, 1, true), MIN_VIEW);
  assert.equal(dragWidth(2000, 5000, 1, true), MAX_VIEW);
});

test('the card has the shape of a phone, a tablet or a desktop window', () => {
  assert.equal(frameHeight(390), 844);
  assert.equal(frameHeight(320), 844);
  assert.equal(frameHeight(768), 1024);
  assert.equal(frameHeight(1000), 1024);
  assert.equal(frameHeight(1280), 800);
  assert.equal(frameHeight(2560), 800);
});

test('the address names the preset, and the view only at another width', () => {
  assert.equal(
    widthAddress(PAGE, { width: 768, view: null }),
    'http://127.0.0.1:5000/drafts/shop?version=3&state=empty&width=768',
  );
  assert.equal(
    widthAddress(PAGE, { width: 390, view: 1000 }),
    'http://127.0.0.1:5000/drafts/shop?version=3&state=empty&width=390&view=1000',
  );
});

test('going back to a preset takes the view out of the address', () => {
  const custom = widthAddress(PAGE, { width: 390, view: 1000 });
  assert.equal(widthAddress(custom, { width: 1280, view: null }), PAGE.replace('390', '1280'));
});

test('the address keeps everything else it had: the comparison, the state, the hash', () => {
  const comparing = `${PAGE}&compare=1#top`;
  const next = new URL(widthAddress(comparing, { width: 768, view: 900 }));
  assert.equal(next.searchParams.get('compare'), '1');
  assert.equal(next.searchParams.get('state'), 'empty');
  assert.equal(next.searchParams.get('version'), '3');
  assert.equal(next.searchParams.get('width'), '768');
  assert.equal(next.searchParams.get('view'), '900');
  assert.equal(next.hash, '#top');
});

test('a state link gets the width shown now, and keeps its own state', () => {
  const link = 'http://127.0.0.1:5000/drafts/shop?version=3&state=filled&width=390';
  const next = new URL(widthAddress(link, { width: 768, view: 900 }));
  assert.equal(next.searchParams.get('state'), 'filled');
  assert.equal(next.searchParams.get('width'), '768');
  assert.equal(next.searchParams.get('view'), '900');
});
