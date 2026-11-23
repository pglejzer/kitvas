import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endedJobSlug, jobOf, needsRefresh } from '../../../client/studio/job-events.ts';

const job = (fields: Record<string, unknown>) => ({ event: 'job', data: JSON.stringify(fields) });

test('a build or check that succeeded or failed names its draft', () => {
  assert.equal(endedJobSlug(job({ kind: 'build', slug: 'shop', state: 'succeeded' })), 'shop');
  assert.equal(endedJobSlug(job({ kind: 'check', slug: 'cart', state: 'failed' })), 'cart');
});

test('a running or cancelled job, another event or a bad payload names none', () => {
  assert.equal(endedJobSlug(job({ slug: 'shop', state: 'running' })), undefined);
  assert.equal(endedJobSlug(job({ slug: 'shop', state: 'cancelled' })), undefined);
  assert.equal(endedJobSlug(job({ slug: 7, state: 'failed' })), undefined);
  assert.equal(endedJobSlug(job({ state: 'failed' })), undefined);
  const inbox = { event: 'inbox', data: '{"slug":"shop","state":"failed"}' };
  assert.equal(endedJobSlug(inbox), undefined);
  for (const data of ['', 'not json', 'null', '[]', '"shop"', '[{"slug":"shop"}]']) {
    assert.equal(endedJobSlug({ event: 'job', data }), undefined, data);
  }
});

test('a catalog job builds a kit, so it names no draft and refreshes no page', () => {
  for (const state of ['succeeded', 'failed']) {
    const catalog = job({ kind: 'catalog', slug: 'base', state, result: { built: true } });
    assert.equal(endedJobSlug(catalog), undefined, state);
    assert.equal(
      needsRefresh(catalog, () => true),
      false,
      state,
    );
    assert.equal(
      needsRefresh(catalog, (slug) => slug === 'base'),
      false,
      state,
    );
  }
  // A draft may share the kit's name; its own jobs still refresh it.
  const draft = job({ kind: 'build', slug: 'base', state: 'succeeded' });
  assert.equal(
    needsRefresh(draft, (slug) => slug === 'base'),
    true,
  );
});

test('a job event is read as a plain object, anything else as nothing', () => {
  const fields = { kind: 'catalog', slug: 'base', state: 'running' };
  assert.deepEqual(jobOf(job(fields)), fields);
  assert.equal(jobOf({ event: 'inbox', data: '{"slug":"base"}' }), undefined);
  for (const data of ['', 'not json', 'null', '[]', '7', '"base"']) {
    assert.equal(jobOf({ event: 'job', data }), undefined, data);
  }
});

test('a page refreshes for its own drafts and after a reset', () => {
  const shop = (slug: string) => slug === 'shop';
  assert.equal(needsRefresh(job({ slug: 'shop', state: 'succeeded' }), shop), true);
  assert.equal(needsRefresh(job({ slug: 'cart', state: 'succeeded' }), shop), false);
  assert.equal(needsRefresh(job({ slug: 'shop', state: 'running' }), shop), false);
  assert.equal(needsRefresh({ event: 'reset', data: '{}', id: '4' }, shop), true);
  assert.equal(needsRefresh({ event: 'inbox', data: '{"pending":1}' }, shop), false);
});
