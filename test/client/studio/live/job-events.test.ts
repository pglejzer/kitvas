import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOf,
  endedJobSlug,
  jobOf,
  needsRefresh,
  needsReload,
  sourceOf,
} from '../../../../client/studio/live/job-events.ts';

const job = (fields: Record<string, unknown>) => ({ event: 'job', data: JSON.stringify(fields) });
const source = (fields: unknown) => ({ event: 'source', data: JSON.stringify(fields) });
const build = (fields: unknown) => ({ event: 'build', data: JSON.stringify(fields) });

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
    const catalog = job({ kind: 'catalog', slug: 'kitvas-ui', state, result: { built: true } });
    assert.equal(endedJobSlug(catalog), undefined, state);
    assert.equal(
      needsRefresh(catalog, () => true),
      false,
      state,
    );
    assert.equal(
      needsRefresh(catalog, (slug) => slug === 'kitvas-ui'),
      false,
      state,
    );
  }
  // A draft may share the kit's name; its own jobs still refresh it.
  const draft = job({ kind: 'build', slug: 'kitvas-ui', state: 'succeeded' });
  assert.equal(
    needsRefresh(draft, (slug) => slug === 'kitvas-ui'),
    true,
  );
});

test('a job event is read as a plain object, anything else as nothing', () => {
  const fields = { kind: 'catalog', slug: 'kitvas-ui', state: 'running' };
  assert.deepEqual(jobOf(job(fields)), fields);
  assert.equal(jobOf({ event: 'inbox', data: '{"slug":"kitvas-ui"}' }), undefined);
  for (const data of ['', 'not json', 'null', '[]', '7', '"kitvas-ui"']) {
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

test('a source event is read with its files and who wrote them, anything malformed as nothing', () => {
  const good = {
    slug: 'shop',
    version: 3,
    files: { 'src/tsx/sections/Hero.tsx': '"abc"' },
    by: 'other',
  };
  assert.deepEqual(sourceOf(source(good)), good);
  const mine = { ...good, files: {}, by: 'editor' };
  assert.deepEqual(sourceOf(source(mine)), mine);
  for (const bad of [
    { ...good, by: 'claude' },
    { ...good, version: 0 },
    { ...good, version: 1.5 },
    { ...good, slug: 3 },
    { ...good, files: [] },
    { ...good, files: null },
    { ...good, files: { 'src/tsx/sections/Hero.tsx': 1 } },
  ]) {
    assert.equal(sourceOf(source(bad)), undefined, JSON.stringify(bad));
  }
  assert.equal(sourceOf(build(good)), undefined, 'another event type');
  for (const data of ['', 'not json', 'null', '[]', '"shop"']) {
    assert.equal(sourceOf({ event: 'source', data }), undefined, data);
  }
});

test('a build event is read with its state and time, anything malformed as nothing', () => {
  const good = { slug: 'shop', version: 2, state: 'succeeded', ms: 420 };
  assert.deepEqual(buildOf(build(good)), good);
  assert.deepEqual(buildOf(build({ ...good, state: 'failed', ms: 0 })), {
    ...good,
    state: 'failed',
    ms: 0,
  });
  for (const bad of [
    { ...good, state: 'running' },
    { ...good, ms: -1 },
    { ...good, ms: 1.5 },
    { ...good, version: 0 },
    { ...good, slug: null },
  ]) {
    assert.equal(buildOf(build(bad)), undefined, JSON.stringify(bad));
  }
  assert.equal(buildOf(job(good)), undefined, 'a job is no studio build');
  for (const data of ['', 'not json', 'null', '[]']) {
    assert.equal(buildOf({ event: 'build', data }), undefined, data);
  }
});

test('a page while the person edits never reloads itself, whatever the event', () => {
  const shop = (slug: string) => slug === 'shop';
  const events = [
    job({ kind: 'build', slug: 'shop', state: 'succeeded' }),
    { event: 'reset', data: '{}', id: '9' },
    build({ slug: 'shop', version: 2, state: 'succeeded', ms: 300 }),
  ];
  for (const event of events) {
    assert.equal(needsReload(event, shop, true), false, event.event);
    assert.equal(needsReload(event, shop, false), true, event.event);
  }
});

test('a studio build reloads a page that shows its draft, once it succeeded', () => {
  const shop = (slug: string) => slug === 'shop';
  const built = { slug: 'shop', version: 2, state: 'succeeded', ms: 300 };
  assert.equal(needsReload(build(built), shop, false), true);
  assert.equal(needsReload(build({ ...built, state: 'failed' }), shop, false), false);
  assert.equal(needsReload(build({ ...built, slug: 'cart' }), shop, false), false);
  assert.equal(
    needsReload(build({ ...built, slug: 'cart' }), () => true, false),
    true,
    'the gallery shows every draft',
  );
  const changed = source({ slug: 'shop', version: 2, files: {}, by: 'other' });
  assert.equal(needsReload(changed, shop, false), false, 'a source change waits for its build');
});
