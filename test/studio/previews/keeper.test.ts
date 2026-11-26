import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PreviewsOnDisk } from '../../../src/checks/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import type { JobOutcome, RunningJob } from '../../../src/studio/jobs/job.ts';
import { createJobs } from '../../../src/studio/jobs/jobs.ts';
import { createPreviewsKeeper } from '../../../src/studio/previews/keeper.ts';
import { NOW } from '../../helpers/draft/drafts.ts';
import { previewsStamp } from '../../helpers/kit/previews.ts';
import { t } from '../../helpers/translate.ts';

const OLD = 'a'.repeat(64);
const NEW = 'b'.repeat(64);

type Started = { args: string[]; finish(outcome: JobOutcome): void };

/** Jobs whose processes end when the test says so; `disk` is what the port reads. */
function setup(first: PreviewsOnDisk = { key: NEW, stamp: undefined, fresh: false }) {
  const started: Started[] = [];
  const jobs = createJobs({
    run: (args): RunningJob => {
      let finish: (outcome: JobOutcome) => void = () => undefined;
      const done = new Promise<JobOutcome>((resolve) => {
        finish = resolve;
      });
      started.push({ args, finish: (outcome) => finish(outcome) });
      return { done, cancel: () => finish({ state: 'cancelled' }) };
    },
    publish: () => undefined,
    now: () => NOW,
    t,
  });
  const errors: unknown[] = [];
  const state = { disk: first };
  const keeper = createPreviewsKeeper({
    previews: {
      read: (kitId) => {
        assert.equal(kitId, 'base');
        return state.disk;
      },
    },
    jobs,
    onError: (error) => errors.push(error),
  });
  return { keeper, started, errors, state };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('previews made for the kit as it is are ready, and nothing starts', () => {
  const ready = previewsStamp(NEW);
  const { keeper, started } = setup({ key: NEW, stamp: ready, fresh: true });
  assert.deepEqual(keeper.view('base'), { state: 'ready', stamp: ready });
  assert.equal(started.length, 0);
});

test('missing previews start one job of the kit; asking again while it runs starts nothing', () => {
  const { keeper, started } = setup();
  assert.deepEqual(keeper.view('base'), { state: 'making', stamp: undefined });
  assert.deepEqual(keeper.view('base'), { state: 'making', stamp: undefined });
  assert.equal(started.length, 1);
  assert.deepEqual(started[0]?.args, ['kit', 'previews', 'base']);
});

test('stale previews are answered while new ones are made, then the new ones are ready', async () => {
  const old = previewsStamp(OLD);
  const { keeper, started, state } = setup({ key: NEW, stamp: old, fresh: false });
  assert.deepEqual(keeper.view('base'), { state: 'making', stamp: old });
  const made = previewsStamp(NEW);
  state.disk = { key: NEW, stamp: made, fresh: true };
  started[0]?.finish({ state: 'succeeded', result: {} });
  await tick();
  assert.deepEqual(keeper.view('base'), { state: 'ready', stamp: made });
  assert.equal(started.length, 1);
});

test('no browser: none, and no job starts again for any kit while the studio runs', async () => {
  const { keeper, started, errors, state } = setup();
  keeper.view('base');
  started[0]?.finish({
    state: 'failed',
    error: { code: 'BROWSER_MISSING', message: 'No browser to run the checks in.' },
  });
  await tick();
  assert.deepEqual(keeper.view('base'), { state: 'none' });
  // Even a changed kit does not try again: there is still no browser.
  state.disk = { key: OLD, stamp: undefined, fresh: false };
  assert.deepEqual(keeper.view('base'), { state: 'none' });
  assert.equal(started.length, 1);
  assert.deepEqual(errors, [], 'a missing browser is not an error of the studio');
});

test('a failed job is logged and answers none until the kit changes, then one job starts', async () => {
  const { keeper, started, errors, state } = setup();
  keeper.view('base');
  started[0]?.finish({ state: 'failed', error: { code: 'PREVIEWS_FAILED', message: 'no build' } });
  await tick();
  assert.deepEqual(keeper.view('base'), { state: 'none' });
  assert.deepEqual(keeper.view('base'), { state: 'none' });
  assert.equal(started.length, 1, 'never in a loop');
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /kit previews base: PREVIEWS_FAILED: no build/);

  state.disk = { key: OLD, stamp: undefined, fresh: false };
  assert.equal(keeper.view('base').state, 'making');
  assert.equal(started.length, 2);
});

test('a job that ended well but left stale previews for the same key is not started again', async () => {
  const { keeper, started, errors } = setup();
  keeper.view('base');
  started[0]?.finish({ state: 'succeeded', result: {} });
  await tick();
  assert.deepEqual(keeper.view('base'), { state: 'none' });
  assert.equal(started.length, 1);
  assert.equal(errors.length, 1);
});

test('a kit that cannot be built has none and starts nothing', () => {
  const { keeper, started } = setup({ key: undefined, stamp: undefined, fresh: false });
  assert.deepEqual(keeper.view('base'), { state: 'none' });
  assert.equal(started.length, 0);
});

test('a read that breaks is logged and answers none, so the palette still answers', () => {
  const errors: unknown[] = [];
  const keeper = createPreviewsKeeper({
    previews: {
      read: () => {
        throw new Error('disk on fire');
      },
    },
    jobs: {
      start: () => {
        throw new KitvasError('INTERNAL');
      },
      get: () => {
        throw new KitvasError('JOB_NOT_FOUND');
      },
    },
    onError: (error) => errors.push(error),
  });
  assert.deepEqual(keeper.view('base'), { state: 'none' });
  assert.equal(errors.length, 1);
});

test('a job the runner refuses as running is waited for, not started twice', () => {
  const errors: unknown[] = [];
  let starts = 0;
  const keeper = createPreviewsKeeper({
    previews: { read: () => ({ key: NEW, stamp: undefined, fresh: false }) },
    jobs: {
      start: () => {
        starts += 1;
        throw new KitvasError('JOB_RUNNING', { slug: 'base', job: 'other-job' });
      },
      get: (id) => {
        assert.equal(id, 'other-job');
        return {
          id,
          kind: 'previews',
          slug: 'base',
          state: 'running',
          createdAt: NOW.toISOString(),
          finishedAt: null,
          result: null,
          error: null,
        };
      },
    },
    onError: (error) => errors.push(error),
  });
  assert.equal(keeper.view('base').state, 'making');
  assert.equal(keeper.view('base').state, 'making');
  assert.equal(starts, 1);
  assert.deepEqual(errors, []);
});
