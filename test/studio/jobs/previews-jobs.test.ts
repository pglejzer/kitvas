import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHARED_BROWSER_ENV, type SharedBrowser } from '../../../src/checks/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { type JobOutcome, JobSchema, type RunningJob } from '../../../src/studio/jobs/job.ts';
import { createJobs } from '../../../src/studio/jobs/jobs.ts';
import { keepBrowser } from '../../../src/studio/jobs/shared-browser.ts';
import { NOW } from '../../helpers/drafts.ts';
import { t } from '../../helpers/translate.ts';

type Started = { args: string[]; finish(outcome: JobOutcome): void; cancelled: number };

function setup() {
  const started: Started[] = [];
  const jobs = createJobs({
    run: (args): RunningJob => {
      let finish: (outcome: JobOutcome) => void = () => undefined;
      const done = new Promise<JobOutcome>((resolve) => {
        finish = resolve;
      });
      const entry: Started = { args, finish: (outcome) => finish(outcome), cancelled: 0 };
      started.push(entry);
      return {
        done,
        cancel: () => {
          entry.cancelled += 1;
          finish({ state: 'cancelled' });
        },
      };
    },
    publish: () => undefined,
    now: () => NOW,
    t,
  });
  return { jobs, started };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const isCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test('a previews job runs `kit previews <id>`, one per kit at a time', async () => {
  const { jobs, started } = setup();
  const job = jobs.start('previews', 'base');
  assert.equal(JobSchema.parse(job).kind, 'previews');
  assert.equal(job.slug, 'base');
  assert.deepEqual(started[0]?.args, ['kit', 'previews', 'base']);
  assert.throws(
    () => jobs.start('previews', 'base'),
    (error: unknown) =>
      error instanceof KitvasError && error.code === 'JOB_RUNNING' && error.params.job === job.id,
  );
  assert.equal(jobs.start('previews', 'other').state, 'running');
  started[0]?.finish({ state: 'succeeded', result: { cached: false } });
  await tick();
  assert.equal(jobs.get(job.id).state, 'succeeded');
  assert.equal(jobs.start('previews', 'base').state, 'running');
});

test("a kit's previews, its examples and a draft of the same name do not hold each other up", () => {
  const { jobs, started } = setup();
  jobs.start('previews', 'base');
  jobs.start('catalog', 'base');
  jobs.start('build', 'base');
  assert.deepEqual(
    started.map((entry) => entry.args),
    [
      ['kit', 'previews', 'base'],
      ['kit', 'build', 'base'],
      ['build', 'base'],
    ],
  );
});

test('deleting a draft stops its own jobs, never the previews of a kit of that name', async () => {
  const { jobs, started } = setup();
  const previews = jobs.start('previews', 'shop');
  const build = jobs.start('build', 'shop');
  await jobs.stopFor('shop');
  assert.deepEqual(
    started.map((entry) => entry.cancelled),
    [0, 1],
  );
  await tick();
  assert.equal(jobs.get(previews.id).state, 'running');
  assert.equal(jobs.get(build.id).state, 'cancelled');
});

test('a previews job gets the shared browser; a catalog job does not', async () => {
  const browser: SharedBrowser = {
    name: 'fake',
    endpoint: 'ws://127.0.0.1:1/1',
    pid: 9001,
    closed: new Promise(() => undefined),
    close: async () => undefined,
  };
  const keeper = keepBrowser(async () => browser);
  assert.deepEqual(await keeper.envFor(['kit', 'build', 'base']), {});
  assert.deepEqual(await keeper.envFor(['kit', 'previews', 'base']), {
    [SHARED_BROWSER_ENV.endpoint]: 'ws://127.0.0.1:1/1',
    [SHARED_BROWSER_ENV.name]: 'fake',
  });
  await keeper.close();
});

test('a browser that cannot start fails the previews job as BROWSER_MISSING', async () => {
  const keeper = keepBrowser(async () => {
    throw new KitvasError('BROWSER_MISSING', { dir: 'x' });
  });
  await assert.rejects(keeper.envFor(['kit', 'previews', 'base']), isCode('BROWSER_MISSING'));
  await keeper.close();
});
