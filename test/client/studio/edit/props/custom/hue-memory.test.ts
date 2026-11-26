import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatColour,
  hsvOf,
  readColour,
  rgbaOf,
} from '../../../../../../client/studio/edit/props/custom/colour-math.ts';
import {
  forgetHue,
  recallHue,
  rememberHue,
  startOf,
} from '../../../../../../client/studio/edit/props/custom/hue-memory.ts';

test('the hue set on black is recalled for black and for no other colour', () => {
  forgetHue();
  assert.equal(recallHue('#000000'), null);
  const moved = { h: 210, s: 0.6, v: 0, a: 1 };
  const css = formatColour(rgbaOf(moved));
  rememberHue(css, moved);
  assert.deepEqual(recallHue(css), { h: 210, s: 0.6 });
  assert.equal(recallHue('#ffffff'), null);
  forgetHue();
  assert.equal(recallHue(css), null);
});

test('a picker drawn again starts where the person left the knobs', () => {
  const black = readColour('#000000');
  const grey = readColour('#808080');
  const blue = readColour('#3366cc');
  assert.ok(black && grey && blue);
  const kept = { h: 210, s: 0.6 };
  // Black has no hue and no saturation of its own: both are the kept ones.
  assert.deepEqual(startOf(hsvOf(black), kept), { h: 210, s: 0.6, v: 0, a: 1 });
  // A grey keeps its own saturation (none) and takes the kept hue.
  const greyStart = startOf(hsvOf(grey), kept);
  assert.equal(greyStart.h, 210);
  assert.equal(greyStart.s, 0);
  // A colour with a hue of its own is read as it is, and so is anything with nothing kept.
  assert.deepEqual(startOf(hsvOf(blue), kept), hsvOf(blue));
  assert.deepEqual(startOf(hsvOf(black), null), hsvOf(black));
  // The colour itself never changes by what is kept.
  assert.deepEqual(rgbaOf(startOf(hsvOf(black), kept)), black);
  assert.deepEqual(rgbaOf(greyStart), grey);
});
