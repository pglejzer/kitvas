import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KitvasError } from '../../../src/shared/index.ts';
import { apiRoutes } from '../../../src/studio/api/routes.ts';
import type { RunningJob } from '../../../src/studio/jobs/job.ts';
import { createJobs } from '../../../src/studio/jobs/jobs.ts';
import { NOW } from '../../helpers/draft/drafts.ts';
import { apiDeps } from '../../helpers/studio/api.ts';
import { t } from '../../helpers/translate.ts';

function setup() {
  const started: string[][] = [];
  const jobs = createJobs({
    run: (args): RunningJob => {
      started.push(args);
      return { done: new Promise(() => undefined), cancel: () => undefined };
    },
    publish: () => undefined,
    now: () => NOW,
    t,
  });
  const routes = apiRoutes(apiDeps({ jobs }));
  const route = routes.find((candidate) => candidate.id === 'startCatalog');
  assert.ok(route, 'startCatalog is in the table');
  const run = async (id: string) =>
    route.handle({
      params: { id },
      headers: {},
      query: new URLSearchParams(),
      host: '127.0.0.1:5000',
      body: {},
    });
  return { route, run, started, routes };
}

const isCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test('the catalog route is a write that answers 202 with the job and its address', async () => {
  const { route, run, started } = setup();
  assert.equal(route.method, 'POST');
  assert.equal(route.path, '/api/v1/kits/{id}/catalog');
  assert.equal(route.policy, 'write');
  const result = await run('kitvas-ui');
  assert.equal(result.status, 202);
  route.response.schema.parse(result.body);
  const job = result.body as { id: string; kind: string; slug: string; state: string };
  assert.equal(job.kind, 'catalog');
  assert.equal(job.slug, 'kitvas-ui');
  assert.equal(job.state, 'running');
  assert.equal(result.headers?.location, `/api/v1/jobs/${job.id}`);
  assert.deepEqual(started, [['kit', 'build', 'kitvas-ui']]);
});

test('an unknown kit is KIT_NOT_FOUND and starts nothing', async () => {
  const { run, started } = setup();
  await assert.rejects(run('nope'), isCode('KIT_NOT_FOUND'));
  assert.deepEqual(started, []);
});

test('a second catalog job of the kit is JOB_RUNNING', async () => {
  const { run, started } = setup();
  await run('kitvas-ui');
  await assert.rejects(run('kitvas-ui'), isCode('JOB_RUNNING'));
  assert.equal(started.length, 1);
});

test('the id parameter only takes a kit id', () => {
  const { route } = setup();
  for (const id of ['Kitvas-ui', '-kitvas-ui', '', 'a/b', '..', 'a'.repeat(64)]) {
    assert.equal(route.params.safeParse({ id }).success, false, id);
  }
  assert.equal(route.params.safeParse({ id: 'kitvas-ui' }).success, true);
});

test('the catalog route is a write: the policy and the body schema refuse extra fields', () => {
  const { route } = setup();
  assert.ok(route.request);
  assert.equal(route.request.safeParse({}).success, true);
  assert.equal(route.request.safeParse({ extra: 1 }).success, false);
});
