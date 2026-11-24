import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLiveLoop,
  DEBOUNCE_MS,
  TYPING_MS,
} from '../../../../../client/studio/edit/live/loop.ts';
import { fakeClock } from '../../../../helpers/fake-clock.ts';

function loopOf(findings = false) {
  const clock = fakeClock(1_000);
  let measured = 0;
  const loop = createLiveLoop(clock, {
    measure: () => {
      measured += 1;
    },
    worth: () => findings,
  });
  return { clock, loop, measured: () => measured };
}

test('an applied edit is measured a moment after the cards show its build, never before', () => {
  const { clock, loop, measured } = loopOf();
  loop.applied(3);
  // The build the cards showed when the edit went out is not its build.
  loop.built(3);
  clock.advance(DEBOUNCE_MS * 4);
  assert.equal(measured(), 0);
  loop.built(4);
  clock.advance(DEBOUNCE_MS - 1);
  assert.equal(measured(), 0);
  clock.advance(1);
  assert.equal(measured(), 1);
  // Measured once: a later build of nobody's edit, with nothing found, waits for the next edit.
  loop.built(5);
  clock.advance(DEBOUNCE_MS * 4);
  assert.equal(measured(), 1);
});

test('builds that come quickly one after another are measured once, after the last', () => {
  const { clock, loop, measured } = loopOf();
  loop.applied(0);
  loop.built(1);
  clock.advance(DEBOUNCE_MS - 50);
  loop.built(2);
  clock.advance(DEBOUNCE_MS - 50);
  assert.equal(measured(), 0);
  clock.advance(50);
  assert.equal(measured(), 1);
});

test('a new edit before its build cancels the measuring of the page before it', () => {
  const { clock, loop, measured } = loopOf();
  loop.applied(0);
  loop.built(1);
  loop.applied(1);
  clock.advance(DEBOUNCE_MS * 2);
  assert.equal(measured(), 0);
  loop.built(2);
  clock.advance(DEBOUNCE_MS);
  assert.equal(measured(), 1);
});

test('nothing is measured during a drag; its end measures what waited', () => {
  const { clock, loop, measured } = loopOf();
  loop.applied(0);
  loop.dragging(true);
  loop.built(1);
  clock.advance(DEBOUNCE_MS * 8);
  assert.equal(measured(), 0);
  loop.dragging(false);
  clock.advance(DEBOUNCE_MS);
  assert.equal(measured(), 1);
  // A drag with nothing waiting measures nothing at its end.
  loop.dragging(true);
  loop.dragging(false);
  clock.advance(DEBOUNCE_MS * 4);
  assert.equal(measured(), 1);
});

test('typing holds the measuring back until the keys rest', () => {
  const { clock, loop, measured } = loopOf();
  loop.applied(0);
  loop.built(1);
  clock.advance(DEBOUNCE_MS - 10);
  loop.typed();
  clock.advance(10);
  assert.equal(measured(), 0);
  clock.advance(TYPING_MS - 11);
  assert.equal(measured(), 0);
  clock.advance(1);
  assert.equal(measured(), 1);
});

test('a build no edit asked for is measured again only while there are findings', () => {
  const quiet = loopOf(false);
  quiet.loop.built(1);
  quiet.clock.advance(DEBOUNCE_MS);
  assert.equal(quiet.measured(), 0);
  const found = loopOf(true);
  found.loop.built(1);
  found.clock.advance(DEBOUNCE_MS);
  assert.equal(found.measured(), 1);
});

test('Edit off stops what waits', () => {
  const { clock, loop, measured } = loopOf();
  loop.applied(0);
  loop.built(1);
  loop.stop();
  clock.advance(DEBOUNCE_MS * 4);
  assert.equal(measured(), 0);
  assert.equal(clock.pending(), 0);
});
