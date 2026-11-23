import assert from 'node:assert/strict';
import { test } from 'node:test';
import { etagOf } from '../../../src/studio/http/etag.ts';
import type { BuiltDraft } from '../../../src/studio/live/builder.ts';
import { startLiveLoop } from '../../../src/studio/live/live-loop.ts';
import { QUIET_MS } from '../../../src/studio/live/watcher.ts';
import { fakeClock } from '../../helpers/fake-clock.ts';

const HERO = 'src/tsx/sections/Hero.tsx';

/** Lets every promise that can settle now settle. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test("the editor's write becomes its own source event, then a build event", async () => {
  const clock = fakeClock(0);
  const files = new Map([[`shop/v2/${HERO}`, 'hero']]);
  const published: { type: string; data: unknown }[] = [];
  const live = startLiveLoop({
    watch: () => ({ close: () => undefined }),
    build: async () => ({ ok: true, version: 2 }),
    dispose: async () => undefined,
    drafts: { readText: (slug, relPath) => files.get(`${slug}/${relPath}`) },
    etag: etagOf,
    publish: (type, data) => {
      published.push({ type, data });
    },
    clock,
  });
  live.expect('shop', 2, { [HERO]: etagOf('hero') });
  clock.advance(QUIET_MS);
  await settled();
  assert.deepEqual(published, [
    {
      type: 'source',
      data: { slug: 'shop', version: 2, files: { [HERO]: etagOf('hero') }, by: 'editor' },
    },
    { type: 'build', data: { slug: 'shop', version: 2, state: 'succeeded', ms: 0 } },
  ]);
  await live.close();
});

test('close stops the watch, waits for the build that runs, then stops the tools once', async () => {
  const clock = fakeClock(0);
  const steps: string[] = [];
  let finish: () => void = () => undefined;
  const live = startLiveLoop({
    watch: (onChange) => {
      // A change Claude made just before the studio stops.
      setImmediate(() => onChange('shop\\v1\\src\\tsx\\sections\\Hero.tsx'));
      return { close: () => steps.push('watch closed') };
    },
    build: () =>
      new Promise<BuiltDraft>((resolve) => {
        steps.push('build started');
        finish = () => {
          steps.push('build ended');
          resolve({ ok: true, version: 1 });
        };
      }),
    dispose: async () => {
      steps.push('tools stopped');
    },
    drafts: { readText: () => 'hero' },
    etag: etagOf,
    publish: () => undefined,
    clock,
  });
  await settled();
  clock.advance(QUIET_MS);
  const closing = Promise.all([live.close(), live.close()]);
  await settled();
  finish();
  await closing;
  assert.deepEqual(steps, ['build started', 'watch closed', 'build ended', 'tools stopped']);
});
