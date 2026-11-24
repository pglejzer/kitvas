import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AA,
  AAA,
  CANVAS,
  contrastRatio,
  enhancedRatio,
  formatRgb,
  isLargeText,
  MIN_TARGET,
  neededRatio,
  over,
  parseColour,
  shownRatio,
  targetOk,
  textContrast,
} from '../../../../client/frame/live/colour.ts';
import * as page from '../../../../client/studio/edit/live/colour.ts';

const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const near = (value: number, wanted: number): boolean => Math.abs(value - wanted) < 1e-9;

test('computed colours are read in every form the browser writes, and hex', () => {
  assert.deepEqual(parseColour('rgb(255, 0, 0)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColour('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColour('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColour('color(srgb 1 0 0.5)'), { r: 255, g: 0, b: 127.5, a: 1 });
  assert.deepEqual(parseColour('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColour('#0000FF80'), { r: 0, g: 0, b: 255, a: 128 / 255 });
  assert.deepEqual(parseColour('transparent'), { r: 0, g: 0, b: 0, a: 0 });
});

test('a colour the maths cannot read is null, so the frame paints it to read it', () => {
  for (const text of ['oklch(0.5 0.1 200)', 'rgb(1, 2)', 'rgb(1 2 3 4 / 1)', '#12', '#12345']) {
    assert.equal(parseColour(text), null, text);
  }
});

test('the contrast ratio is WCAG 2.2: 21 for black on white, 4.54 for #767676', () => {
  assert.ok(near(contrastRatio(BLACK, CANVAS), 21));
  assert.equal(contrastRatio(CANVAS, CANVAS), 1);
  const grey = parseColour('#767676');
  assert.ok(grey);
  assert.equal(shownRatio(contrastRatio(grey, CANVAS)), 4.54);
  const lighter = parseColour('#777777');
  assert.ok(lighter);
  // 4.478 is cut, never rounded up to a passing 4.5.
  assert.equal(shownRatio(contrastRatio(lighter, CANVAS)), 4.47);
});

test('a translucent text or background is painted over what is behind it first', () => {
  assert.deepEqual(over({ r: 255, g: 0, b: 0, a: 0.5 }, CANVAS), {
    r: 255,
    g: 127.5,
    b: 127.5,
    a: 1,
  });
  const half = textContrast({ ...BLACK, a: 0.5 }, CANVAS);
  assert.ok(half > 3.9 && half < 4, String(half));
  // A transparent background is the canvas.
  assert.ok(near(textContrast(BLACK, { r: 0, g: 0, b: 0, a: 0 }), 21));
});

test('large text is 24 px, or 18.66 px when bold; it needs 3:1, other text 4.5:1', () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(23.9, 400), false);
  assert.equal(isLargeText(18.66, 700), true);
  assert.equal(isLargeText(18.66, 600), false);
  assert.equal(isLargeText(18, 700), false);
  assert.equal(neededRatio(true), 3);
  assert.equal(neededRatio(false), 4.5);
  assert.equal(enhancedRatio(true), 4.5);
  assert.equal(enhancedRatio(false), 7);
});

test('a target is 24 by 24 px at least; a hundredth of a pixel of rounding is forgiven', () => {
  assert.equal(MIN_TARGET, 24);
  assert.equal(targetOk(24, 24), true);
  assert.equal(targetOk(23.995, 40), true);
  assert.equal(targetOk(23.9, 40), false);
  assert.equal(targetOk(40, 20), false);
});

test('a colour is written back as rgb, or rgba when it is not opaque', () => {
  assert.equal(formatRgb({ r: 10.4, g: 20.6, b: 30, a: 1 }), 'rgb(10, 21, 30)');
  assert.equal(formatRgb({ r: 10, g: 20, b: 30, a: 0.5 }), 'rgba(10, 20, 30, 0.5)');
});

test("the page's copy of the colour maths gives the frame's answers", () => {
  assert.deepEqual(page.AA, AA);
  assert.deepEqual(page.AAA, AAA);
  assert.equal(page.MIN_TARGET, MIN_TARGET);
  assert.deepEqual(page.CANVAS, CANVAS);
  const samples = [
    'rgb(255, 0, 0)',
    'rgba(0, 0, 0, 0.5)',
    'rgb(10 20 30 / 50%)',
    'color(srgb 1 0 0.5)',
    '#767676',
    '#0000ff80',
    'transparent',
    'oklch(0.5 0.1 200)',
  ];
  for (const text of samples) assert.deepEqual(page.parseColour(text), parseColour(text), text);
  const pairs: [string, string][] = [
    ['#767676', '#ffffff'],
    ['rgba(0, 0, 0, 0.5)', 'rgb(240, 240, 240)'],
    ['rgb(29, 32, 37)', 'rgba(255, 0, 0, 0.2)'],
  ];
  for (const [text, background] of pairs) {
    const a = parseColour(text);
    const b = parseColour(background);
    assert.ok(a && b);
    assert.equal(page.textContrast(a, b), textContrast(a, b));
    assert.deepEqual(page.over(a, b), over(a, b));
  }
  for (const large of [true, false]) {
    assert.equal(page.neededRatio(large), neededRatio(large));
    assert.equal(page.enhancedRatio(large), enhancedRatio(large));
  }
});
