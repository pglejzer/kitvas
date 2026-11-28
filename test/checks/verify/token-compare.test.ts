import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  colorHex,
  compareToken,
  parseHex,
  sameColor,
  sameDimension,
  sameText,
  tokenRgba,
  toPx,
} from '../../../src/checks/domain/kit/token-compare.ts';

const INK = tokenRgba([0.102, 0.102, 0.102]);

test('a token colour becomes channels and hex; alpha shows only when not opaque', () => {
  assert.deepEqual(INK, { red: 26, green: 26, blue: 26, alpha: 255 });
  assert.equal(colorHex(INK), '#1a1a1a');
  assert.deepEqual(tokenRgba([0, 0.3333, 1], 0.5), { red: 0, green: 85, blue: 255, alpha: 128 });
  assert.equal(colorHex({ red: 0, green: 85, blue: 255, alpha: 128 }), '#0055ff80');
  assert.equal(colorHex({ red: 300, green: -4, blue: 9.6, alpha: 255 }), '#ff000a');
});

test('hex is read with and without alpha, and nothing else', () => {
  assert.deepEqual(parseHex('#1A1a1a'), { red: 26, green: 26, blue: 26, alpha: 255 });
  assert.deepEqual(parseHex(' #0055ff80 '), { red: 0, green: 85, blue: 255, alpha: 128 });
  for (const other of ['', '#fff', '1a1a1a', '#1a1a1', 'rgb(0 0 0)', '#1a1a1a1']) {
    assert.equal(parseHex(other), undefined, other);
  }
});

test('colours are the same when every channel is within 2 of 255', () => {
  const near = { red: 28, green: 24, blue: 26, alpha: 253 };
  assert.equal(sameColor(INK, near), true);
  assert.equal(sameColor(INK, { ...INK, red: 29 }), false);
  assert.equal(sameColor(INK, { ...INK, green: 23 }), false);
  assert.equal(sameColor(INK, { ...INK, blue: 30 }), false);
  assert.equal(sameColor(INK, { ...INK, alpha: 252 }), false);
});

test('lengths are compared in px, a rem being 16', () => {
  assert.equal(toPx('8px'), 8);
  assert.equal(toPx(' 0.5rem '), 8);
  assert.equal(toPx('.25REM'), 4);
  assert.equal(toPx('0'), 0);
  assert.equal(toPx('-2px'), -2);
  for (const other of ['8', '8em', '50%', 'calc(1px + 1px)', '', 'px', '1 px']) {
    assert.equal(toPx(other), undefined, other);
  }
  assert.equal(sameDimension('8px', '0.5rem'), true);
  assert.equal(sameDimension('0', '0px'), true);
  assert.equal(sameDimension('8px', '8.005px'), true);
  assert.equal(sameDimension('8px', '9px'), false);
  assert.equal(sameDimension('8px', 'calc(0.25rem * 2)'), false);
  assert.equal(sameDimension('1em', '1em'), false);
});

test('other values are the same text once spaces are tidied', () => {
  assert.equal(
    sameText(' Inter,  "Segoe UI",\tsans-serif ', 'Inter, "Segoe UI", sans-serif'),
    true,
  );
  assert.equal(sameText('700', '700'), true);
  assert.equal(sameText('120ms', '0.12s'), false);
  assert.equal(sameText('Inter', 'inter'), false);
});

test('a colour is held against what the browser painted, whatever the notation', () => {
  const ink = { type: 'color', css: '#1a1a1a', rgba: INK };
  assert.deepEqual(compareToken(ink, { value: 'oklch(0.2 0 0)', color: '#1b1b1b', length: null }), {
    result: 'same',
  });
  // The browser's hex is what the kit should say instead.
  assert.deepEqual(
    compareToken(ink, { value: 'hsl(220 100% 50%)', color: '#0055ff', length: null }),
    {
      result: 'different',
      expected: '#1a1a1a',
      actual: '#0055ff',
    },
  );
  assert.deepEqual(
    compareToken(ink, { value: 'rgb(26 26 26 / 0.5)', color: '#1a1a1a80', length: null }),
    {
      result: 'different',
      expected: '#1a1a1a',
      actual: '#1a1a1a80',
    },
  );
  // Not a colour at all: the raw value is all there is to show.
  assert.deepEqual(compareToken(ink, { value: '0  0% 10%', color: null, length: null }), {
    result: 'different',
    expected: '#1a1a1a',
    actual: '0 0% 10%',
  });
});

test('a length and any other value are held against the computed text', () => {
  const space = { type: 'dimension', css: '8px' };
  assert.deepEqual(compareToken(space, { value: '0.5rem', color: null, length: null }), {
    result: 'same',
  });
  assert.deepEqual(compareToken(space, { value: '12px', color: null, length: null }), {
    result: 'different',
    expected: '8px',
    actual: '12px',
  });
  const weight = { type: 'fontWeight', css: '700' };
  assert.deepEqual(compareToken(weight, { value: ' 700 ', color: null, length: null }), {
    result: 'same',
  });
  assert.deepEqual(compareToken(weight, { value: 'bold', color: null, length: null }), {
    result: 'different',
    expected: '700',
    actual: 'bold',
  });
});

test('a length the browser worked out, such as a calc(), is held in px', () => {
  const radius = { type: 'dimension', css: '6px' };
  const seen = (length: number | null) => ({ value: 'calc(0.5rem - 2px)', color: null, length });
  assert.deepEqual(compareToken(radius, seen(6)), { result: 'same' });
  // The px the browser laid out is what the kit should say instead.
  assert.deepEqual(compareToken(radius, seen(4)), {
    result: 'different',
    expected: '6px',
    actual: '4px',
  });
  // Nothing measured: the raw value is all there is to show.
  assert.deepEqual(compareToken(radius, seen(null)), {
    result: 'different',
    expected: '6px',
    actual: 'calc(0.5rem - 2px)',
  });
});

test('a variable without a value was not read', () => {
  const space = { type: 'dimension', css: '8px' };
  assert.deepEqual(compareToken(space, { value: '', color: null, length: null }), {
    result: 'unread',
  });
  assert.deepEqual(compareToken(space, { value: '   ', color: null, length: null }), {
    result: 'unread',
  });
});
