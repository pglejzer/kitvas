// The page's lens (plan 19, task 0): one at a time, Design on every start, and who needs Edit.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLens,
  EDIT_LENSES,
  LENSES,
  type LensId,
  type LensRoot,
  lens,
  lensAllowed,
} from '../../../../client/studio/lens/lens.ts';

test('the five lenses, Design first, and it is the one a page starts with', () => {
  assert.deepEqual([...LENSES], ['design', 'kit', 'checks', 'why', 'changes']);
  const root: LensRoot = { dataset: {} };
  assert.equal(createLens(root).get(), 'design');
  assert.equal(root.dataset.lens, 'design');
  // Outside a page the shared store works with no root to mark.
  assert.equal(lens.get(), 'design');
});

test('a change marks the root and tells each listener once, with the lens before', () => {
  const root: LensRoot = { dataset: {} };
  const store = createLens(root);
  const heard: [LensId, LensId][] = [];
  store.subscribe((now, before) => heard.push([now, before]));
  store.set('checks');
  assert.equal(store.get(), 'checks');
  assert.equal(root.dataset.lens, 'checks');
  store.set('why');
  assert.deepEqual(heard, [
    ['checks', 'design'],
    ['why', 'checks'],
  ]);
});

test('a set to the lens that is on tells nobody', () => {
  const store = createLens(null);
  let told = 0;
  store.subscribe(() => {
    told += 1;
  });
  store.set('design');
  assert.equal(told, 0);
  store.set('kit');
  store.set('kit');
  assert.equal(told, 1);
});

test('a listener that stopped hears no more, even when it stops while it is told', () => {
  const store = createLens(null);
  const heard: string[] = [];
  const stop = store.subscribe((now) => {
    heard.push(`first ${now}`);
    stop();
  });
  store.subscribe((now) => heard.push(`second ${now}`));
  store.set('why');
  store.set('checks');
  assert.deepEqual(heard, ['first why', 'second why', 'second checks']);
});

test('Kit and Changes need Edit; Design, Checks and Why work in Preview too', () => {
  assert.deepEqual([...EDIT_LENSES], ['kit', 'changes']);
  for (const id of LENSES) assert.ok(lensAllowed(id, true), id);
  assert.deepEqual(
    LENSES.filter((id) => lensAllowed(id, false)),
    ['design', 'checks', 'why'],
  );
});
