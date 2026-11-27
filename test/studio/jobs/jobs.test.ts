import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KitvasError } from '../../../src/shared/index.ts';
import type { Job, JobOutcome, RunningJob } from '../../../src/studio/jobs/job.ts';
import { createJobs } from '../../../src/studio/jobs/jobs.ts';
import { NOW } from '../../helpers/draft/drafts.ts';
import { t } from '../../helpers/translate.ts';

type Started = { args: string[]; finish(outcome: JobOutcome): void; cancelled: number };

/** A runner whose jobs end when the test says so. */
function controlled() {
  const started: Started[] = [];
  const run = (args: string[]): RunningJob => {
    let resolve: (outcome: JobOutcome) => void = () => undefined;
    const done = new Promise<JobOutcome>((settle) => {
      resolve = settle;
    });
    const entry: Started = { args, finish: (outcome) => resolve(outcome), cancelled: 0 };
    started.push(entry);
    return {
      done,
      cancel: () => {
        entry.cancelled += 1;
        resolve({ state: 'cancelled' });
      },
    };
  };
  return { run, started };
}

function setup(keep?: number) {
  const runner = controlled();
  const published: Job[] = [];
  const jobs = createJobs({
    run: runner.run,
    publish: (job) => published.push(job),
    now: () => NOW,
    t,
    ...(keep === undefined ? {} : { keep }),
  });
  return { jobs, runner, published };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const isCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test('a build runs as a job, published when it starts and when it ends', async () => {
  const { jobs, runner, published } = setup();
  const job = jobs.start('build', 'shop');
  assert.equal(job.state, 'running');
  assert.equal(job.kind, 'build');
  assert.equal(job.finishedAt, null);
  assert.deepEqual(runner.started[0]?.args, ['build', 'shop']);
  assert.deepEqual(published, [job]);
  runner.started[0]?.finish({ state: 'succeeded', result: { files: 3 } });
  await tick();
  const done = jobs.get(job.id);
  assert.equal(done.state, 'succeeded');
  assert.deepEqual(done.result, { files: 3 });
  assert.equal(done.finishedAt, NOW.toISOString());
  assert.deepEqual(published.at(-1), done);
});

test('one job per draft at a time; other drafts are not held up', async () => {
  const { jobs, runner } = setup();
  const first = jobs.start('build', 'shop');
  assert.throws(
    () => jobs.start('build', 'shop'),
    (error: unknown) =>
      isCode('JOB_RUNNING')(error) && (error as KitvasError).params.job === first.id,
  );
  jobs.start('build', 'blog');
  runner.started[0]?.finish({ state: 'failed', error: { code: 'BUILD', message: 'x' } });
  await tick();
  assert.equal(jobs.get(first.id).state, 'failed');
  assert.deepEqual(jobs.get(first.id).error, { code: 'BUILD', message: 'x' });
  assert.equal(jobs.start('build', 'shop').state, 'running');
  assert.deepEqual(
    jobs.list().map((job) => job.slug),
    ['shop', 'blog', 'shop'],
  );
});

test('cancel asks a running job to stop; a finished or unknown job is left as it is', async () => {
  const { jobs, runner } = setup();
  const job = jobs.start('build', 'shop');
  assert.equal(jobs.cancel(job.id).state, 'running');
  await tick();
  assert.equal(jobs.get(job.id).state, 'cancelled');
  assert.equal(jobs.cancel(job.id).state, 'cancelled');
  assert.equal(runner.started[0]?.cancelled, 1);
  assert.throws(() => jobs.get('00000000-0000-4000-8000-000000000000'), isCode('JOB_NOT_FOUND'));
});

test('old finished jobs are dropped; running ones never are', async () => {
  const { jobs, runner } = setup(2);
  const first = jobs.start('build', 'a').id;
  jobs.start('build', 'b');
  jobs.start('build', 'c');
  const running = jobs.start('build', 'd');
  for (const entry of runner.started.slice(0, 3))
    entry.finish({ state: 'succeeded', result: null });
  await tick();
  assert.deepEqual(
    jobs.list().map((job) => job.slug),
    ['d', 'c', 'b'],
  );
  assert.throws(() => jobs.get(first), isCode('JOB_NOT_FOUND'));
  assert.equal(jobs.get(running.id).state, 'running');
});

test('busy while any job runs, for the idle stop', async () => {
  const { jobs, runner } = setup();
  assert.equal(jobs.busy(), false);
  jobs.start('build', 'shop');
  jobs.start('check', 'blog');
  assert.equal(jobs.busy(), true);
  runner.started[0]?.finish({ state: 'succeeded', result: null });
  await tick();
  assert.equal(jobs.busy(), true);
  runner.started[1]?.finish({ state: 'failed', error: { code: 'X', message: 'x' } });
  await tick();
  assert.equal(jobs.busy(), false);
});

test('close stops every running job and waits for it', async () => {
  const { jobs } = setup();
  const a = jobs.start('build', 'shop');
  const b = jobs.start('build', 'blog');
  await jobs.close();
  assert.equal(jobs.get(a.id).state, 'cancelled');
  assert.equal(jobs.get(b.id).state, 'cancelled');
});

test('a runner that breaks gives a failed job, not a stuck one', async () => {
  const jobs = createJobs({
    run: () => ({ done: Promise.reject(new Error('x')), cancel: () => undefined }),
    publish: () => undefined,
    now: () => NOW,
    t,
  });
  const job = jobs.start('build', 'shop');
  await tick();
  assert.equal(jobs.get(job.id).state, 'failed');
  assert.equal(jobs.get(job.id).error?.code, 'INTERNAL');
});

test('a catalog job runs `kit build <id>`, one per kit, apart from a draft of the same name', async () => {
  const { jobs, runner } = setup();
  const catalog = jobs.start('catalog', 'kitvas-ui');
  assert.equal(catalog.kind, 'catalog');
  assert.equal(catalog.slug, 'kitvas-ui');
  assert.deepEqual(runner.started[0]?.args, ['kit', 'build', 'kitvas-ui']);
  assert.throws(
    () => jobs.start('catalog', 'kitvas-ui'),
    (error: unknown) =>
      isCode('JOB_RUNNING')(error) && (error as KitvasError).params.job === catalog.id,
  );
  // A draft called `kitvas-ui` and the kit `kitvas-ui` are two targets.
  const draft = jobs.start('build', 'kitvas-ui');
  assert.deepEqual(runner.started[1]?.args, ['build', 'kitvas-ui']);
  assert.throws(() => jobs.start('check', 'kitvas-ui'), isCode('JOB_RUNNING'));
  assert.equal(jobs.start('catalog', 'other').state, 'running');
  runner.started[0]?.finish({ state: 'succeeded', result: { built: true } });
  await tick();
  assert.equal(jobs.get(catalog.id).state, 'succeeded');
  assert.equal(jobs.get(draft.id).state, 'running');
  assert.equal(jobs.start('catalog', 'kitvas-ui').state, 'running');
});

test('a build and a check of one draft exclude each other; the kind is the command', async () => {
  const { jobs, runner } = setup();
  const check = jobs.start('check', 'shop');
  assert.equal(check.kind, 'check');
  assert.deepEqual(runner.started[0]?.args, ['check', 'shop']);
  assert.throws(() => jobs.start('build', 'shop'), isCode('JOB_RUNNING'));
  runner.started[0]?.finish({ state: 'succeeded', result: null });
  await tick();
  assert.equal(jobs.start('build', 'shop').kind, 'build');
});

test('stopFor cancels the running build and check of a draft and waits for them to end', async () => {
  const { jobs, runner } = setup();
  const build = jobs.start('build', 'shop');
  const other = jobs.start('build', 'cart');
  const catalog = jobs.start('catalog', 'shop');
  await jobs.stopFor('shop');
  assert.deepEqual(
    runner.started.map((entry) => entry.cancelled),
    [1, 0, 0],
    'only the draft own job stops; another draft and a kit of the same name run on',
  );
  await tick();
  assert.equal(jobs.get(build.id).state, 'cancelled');
  assert.equal(jobs.get(other.id).state, 'running');
  assert.equal(jobs.get(catalog.id).state, 'running');
  // Nothing running for a draft: it resolves at once.
  await jobs.stopFor('shop');
  await jobs.stopFor('nope');
});
