import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Bundle, register } from '../../../client/frame/page/swap.ts';
import { startFrame } from '../../../client/frame/runtime.ts';

test('a bundle that runs in a document a runtime already runs only hands itself over', () => {
  const handed: Bundle[] = [];
  // What the runtime that started first left for it, on `globalThis`.
  register((bundle) => {
    handed.push(bundle);
  });
  let mounts = 0;
  const later: Bundle = {
    states: ['default', 'empty'],
    options: [],
    initial: 'default',
    mount: () => {
      mounts += 1;
      return { render: () => undefined, unmount: () => undefined };
    },
    runtime: 'r1',
  };
  // There is no document and no window here: anything it did to the page would throw.
  startFrame(later);
  assert.deepEqual(handed, [later]);
  assert.equal(mounts, 0, 'it mounts nothing itself');
});
