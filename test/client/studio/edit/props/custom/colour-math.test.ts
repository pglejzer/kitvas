import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatColour,
  hsvOf,
  readColour,
  rgbaOf,
} from '../../../../../../client/studio/edit/props/custom/colour-math.ts';

const TWELVE = [
  { r: 0, g: 0, b: 0, a: 1 },
  { r: 255, g: 255, b: 255, a: 1 },
  { r: 255, g: 0, b: 0, a: 1 },
  { r: 0, g: 255, b: 0, a: 1 },
  { r: 0, g: 0, b: 255, a: 1 },
  { r: 255, g: 255, b: 0, a: 1 },
  { r: 0, g: 255, b: 255, a: 1 },
  { r: 255, g: 0, b: 255, a: 1 },
  { r: 128, g: 128, b: 128, a: 1 },
  { r: 18, g: 52, b: 86, a: 1 },
  { r: 250, g: 128, b: 114, a: 0.5 },
  { r: 31, g: 200, b: 99, a: 0.25 },
];

test('twelve colours go to HSV and back within 1 of 255, alpha kept', () => {
  for (const colour of TWELVE) {
    const back = rgbaOf(hsvOf(colour));
    assert.ok(Math.abs(back.r - colour.r) <= 1, JSON.stringify(colour));
    assert.ok(Math.abs(back.g - colour.g) <= 1, JSON.stringify(colour));
    assert.ok(Math.abs(back.b - colour.b) <= 1, JSON.stringify(colour));
    assert.equal(back.a, colour.a);
  }
});

test('the primaries have their hues', () => {
  assert.equal(hsvOf({ r: 255, g: 0, b: 0, a: 1 }).h, 0);
  assert.equal(hsvOf({ r: 0, g: 255, b: 0, a: 1 }).h, 120);
  assert.equal(hsvOf({ r: 0, g: 0, b: 255, a: 1 }).h, 240);
});

test('a grey keeps the hue it was given', () => {
  const grey = { r: 128, g: 128, b: 128, a: 1 };
  assert.equal(hsvOf(grey, 200).h, 200);
  assert.equal(hsvOf({ r: 0, g: 0, b: 0, a: 1 }, 310).h, 310);
  // And a hue at zero saturation still paints the grey.
  assert.deepEqual(rgbaOf({ h: 200, s: 0, v: 0.5, a: 1 }), { r: 128, g: 128, b: 128, a: 1 });
});

test('a colour is shown as #rrggbb, or rgb() with alpha when it is not opaque', () => {
  assert.equal(formatColour({ r: 18, g: 52, b: 86, a: 1 }), '#123456');
  assert.equal(formatColour({ r: 0, g: 0, b: 0, a: 1 }), '#000000');
  assert.equal(formatColour({ r: 250, g: 128, b: 114, a: 0.5 }), 'rgb(250 128 114 / 0.5)');
  assert.equal(formatColour({ r: 1, g: 2, b: 3, a: 0.333 }), 'rgb(1 2 3 / 0.33)');
});

test('the five typed forms are read', () => {
  const blue = { r: 0, g: 102, b: 255, a: 1 };
  assert.deepEqual(readColour('#06f'), blue);
  assert.deepEqual(readColour('#0066ff'), blue);
  assert.deepEqual(readColour('  #0066FF  '), blue);
  assert.deepEqual(readColour('#0066ff80'), { r: 0, g: 102, b: 255, a: 128 / 255 });
  assert.deepEqual(readColour('rgb(0, 102, 255)'), blue);
  assert.deepEqual(readColour('rgb(0 102 255 / 50%)'), { ...blue, a: 0.5 });
  assert.deepEqual(readColour('hsl(0 100% 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(readColour('hsl(120, 100%, 25%)'), { r: 0, g: 128, b: 0, a: 1 });
  assert.deepEqual(readColour('hsla(240 100% 50% / 0.5)'), { r: 0, g: 0, b: 255, a: 0.5 });
});

test('rubbish gives null', () => {
  for (const text of [
    '',
    'blue',
    '#12',
    '#12345',
    '#ggg',
    'rgb(1 2)',
    'hsl(a b c)',
    '12px',
    'var(--x)',
  ]) {
    assert.equal(readColour(text), null, text);
  }
});
