import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDrawScheduler } from '../../../../../client/studio/edit/props/draw.ts';

function setup() {
  const queue: (() => void)[] = [];
  let draws = 0;
  const scheduler = createDrawScheduler({
    frame: (run) => void queue.push(run),
    draw: () => {
      draws += 1;
    },
  });
  const run = (): void => {
    for (const next of queue.splice(0)) next();
  };
  return { scheduler, run, draws: () => draws };
}

test('several requests before a frame draw once', () => {
  const { scheduler, run, draws } = setup();
  scheduler.request();
  scheduler.request();
  scheduler.request();
  run();
  assert.equal(draws(), 1);
});

test('a request while held draws nothing until release, then once', () => {
  const { scheduler, run, draws } = setup();
  scheduler.hold();
  scheduler.request();
  run();
  assert.equal(draws(), 0);
  scheduler.release();
  run();
  assert.equal(draws(), 1);
});

test('two holds need two releases', () => {
  const { scheduler, run, draws } = setup();
  scheduler.hold();
  scheduler.hold();
  scheduler.request();
  scheduler.release();
  run();
  assert.equal(draws(), 0);
  scheduler.release();
  run();
  assert.equal(draws(), 1);
});

test('a release with no hold left stays at zero', () => {
  const { scheduler, run, draws } = setup();
  scheduler.release();
  scheduler.release();
  assert.equal(scheduler.held(), false);
  scheduler.request();
  run();
  assert.equal(draws(), 1);
});

test('a release with no request waiting draws nothing', () => {
  const { scheduler, run, draws } = setup();
  scheduler.hold();
  scheduler.release();
  run();
  assert.equal(draws(), 0);
});
