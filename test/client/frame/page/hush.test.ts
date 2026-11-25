// What the frame draws for the studio leaves the page while a drag runs (ADR 0066).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Hushed, hushed } from '../../../../client/frame/page/hush.ts';

type Bench = { marks: Hushed<string[]>; drawn: string[][] };

function bench(): Bench {
  const drawn: string[][] = [];
  const marks = hushed<string[]>((value) => {
    drawn.push(value);
  }, []);
  return { marks, drawn };
}

test('a value is drawn at once while nothing is hushed', () => {
  const b = bench();
  b.marks.set(['a']);
  b.marks.set(['a', 'b']);
  assert.deepEqual(b.drawn, [['a'], ['a', 'b']]);
});

test('a hush draws nothing, and its end draws the last value again', () => {
  const b = bench();
  b.marks.set(['a']);
  b.marks.hush(true);
  assert.deepEqual(b.drawn, [['a'], []]);
  b.marks.hush(false);
  assert.deepEqual(b.drawn, [['a'], [], ['a']]);
});

test('what is set during a hush waits for its end: only the last one is drawn', () => {
  const b = bench();
  b.marks.hush(true);
  b.marks.set(['a']);
  b.marks.set(['b']);
  assert.deepEqual(b.drawn, [[]]);
  b.marks.hush(false);
  assert.deepEqual(b.drawn, [[], ['b']]);
});

test('a hush or an end said twice draws once', () => {
  const b = bench();
  b.marks.hush(false);
  assert.deepEqual(b.drawn, []);
  b.marks.set(['a']);
  b.marks.hush(true);
  b.marks.hush(true);
  b.marks.hush(false);
  b.marks.hush(false);
  assert.deepEqual(b.drawn, [['a'], [], ['a']]);
});
