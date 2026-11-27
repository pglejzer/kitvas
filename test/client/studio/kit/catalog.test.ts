import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CatalogWatch,
  catalogStep,
  iconsStep,
  postStep,
  startedJob,
} from '../../../../client/studio/kit/catalog.ts';
import type { StreamEvent } from '../../../../client/studio/live/sse.ts';

const JOB = '0b9f2c1e-4d6a-4f3e-9a51-7c2d8e6f1a20';
const OTHER_JOB = '5e1d7a90-2b3c-4e8f-8d6a-1f0e9c7b3a42';

const watch = (fields: Partial<CatalogWatch> = {}): CatalogWatch => ({
  kit: 'kitvas-ui',
  catalog: 'ready',
  job: JOB,
  reloaded: false,
  ...fields,
});

/** What `kitvas kit build` answers (shared contract 3), as the job's result. */
const build = (fields: Record<string, unknown> = {}) => ({
  view: 'build',
  id: 'kitvas-ui',
  built: true,
  cached: false,
  shown: ['Button.1'],
  skipped: [],
  errors: [],
  path: '/project/.kitvas/cache/catalog/kitvas-ui/build/html/index.html',
  ...fields,
});

const job = (fields: Record<string, unknown> = {}): StreamEvent => ({
  event: 'job',
  data: JSON.stringify({
    id: JOB,
    kind: 'catalog',
    slug: 'kitvas-ui',
    state: 'succeeded',
    result: build(),
    error: null,
    ...fields,
  }),
});

test('a fresh build reloads the page, so its frames show the new examples', () => {
  assert.equal(catalogStep(watch(), job()), 'reload');
  assert.equal(catalogStep(watch({ catalog: 'missing' }), job()), 'reload');
});

test('a cached build reloads only a page that had no examples', () => {
  const cached = job({ result: build({ cached: true }) });
  assert.equal(catalogStep(watch(), cached), 'done');
  assert.equal(catalogStep(watch({ catalog: 'missing' }), cached), 'reload');
});

test('a build with errors or a failed job shows the failed note', () => {
  const broken = job({ result: build({ built: false, cached: false }) });
  assert.equal(catalogStep(watch(), broken), 'failed');
  assert.equal(catalogStep(watch({ catalog: 'missing' }), broken), 'failed');
  const failed = job({ state: 'failed', result: null, error: { code: 'X', message: 'x' } });
  assert.equal(catalogStep(watch(), failed), 'failed');
  assert.equal(catalogStep(watch({ catalog: 'missing' }), failed), 'failed');
});

test('a result that is not a build answer counts as failed', () => {
  for (const result of [null, 'built', [build()], {}, build({ built: 'true' })]) {
    assert.equal(catalogStep(watch(), job({ result })), 'failed', JSON.stringify(result));
  }
});

test('a cancelled job leaves examples as they are, and says so where there are none', () => {
  const cancelled = job({ state: 'cancelled', result: null });
  assert.equal(catalogStep(watch(), cancelled), 'done');
  assert.equal(catalogStep(watch({ catalog: 'missing' }), cancelled), 'failed');
});

test('a running job changes nothing yet', () => {
  assert.equal(catalogStep(watch(), job({ state: 'running', result: null })), undefined);
  assert.equal(catalogStep(watch({ job: undefined }), job({ state: 'running' })), undefined);
});

test('a page loaded by its own reload never reloads again', () => {
  const again = watch({ reloaded: true });
  assert.equal(catalogStep(again, job()), 'done');
  assert.equal(catalogStep({ ...again, catalog: 'missing' }, job()), 'failed');
  const cached = job({ result: build({ cached: true }) });
  assert.equal(catalogStep({ ...again, catalog: 'missing' }, cached), 'failed');
  assert.equal(catalogStep(again, cached), 'done');
});

test('once the job is known, only that job counts', () => {
  assert.equal(catalogStep(watch(), job({ id: OTHER_JOB })), undefined);
  assert.equal(catalogStep(watch(), job({ id: undefined })), undefined);
  assert.equal(catalogStep(watch({ job: OTHER_JOB }), job({ id: OTHER_JOB })), 'reload');
});

test('before the job is known, any catalog job of this kit counts', () => {
  const unknown = watch({ job: undefined });
  assert.equal(catalogStep(unknown, job({ id: OTHER_JOB })), 'reload');
  assert.equal(catalogStep(unknown, job({ state: 'failed', result: null })), 'failed');
});

test('jobs of other kits and of drafts are not the catalog', () => {
  const unknown = watch({ job: undefined });
  const others: [string, StreamEvent][] = [
    ['another kit', job({ slug: 'acme' })],
    ['a build of a draft named like the kit', job({ kind: 'build', result: { view: 'build' } })],
    ['a check of a draft named like the kit', job({ kind: 'check' })],
    ['no kind', job({ kind: undefined })],
  ];
  for (const [name, event] of others) {
    assert.equal(catalogStep(unknown, event), undefined, name);
    assert.equal(catalogStep(watch(), event), undefined, name);
  }
});

test('lost events start over; other events and bad data change nothing', () => {
  assert.equal(catalogStep(watch(), { event: 'reset', data: '{}', id: '9' }), 'missed');
  assert.equal(catalogStep(watch(), { event: 'inbox', data: '{"pending":1}' }), undefined);
  for (const data of ['', 'not json', 'null', '[]', '"kitvas-ui"']) {
    assert.equal(catalogStep(watch({ job: undefined }), { event: 'job', data }), undefined, data);
  }
});

test('the answer that starts the job: started or running waits, anything else stops', () => {
  assert.equal(postStep(202, 'ready'), 'wait');
  assert.equal(postStep(202, 'missing'), 'wait');
  assert.equal(postStep(409, 'ready'), 'wait');
  assert.equal(postStep(409, 'missing'), 'wait');
  for (const status of [0, 200, 400, 401, 403, 404, 500, 503]) {
    assert.equal(postStep(status, 'missing'), 'failed', String(status));
    assert.equal(postStep(status, 'ready'), 'done', String(status));
  }
});

test('the started job is named by a 202 answer only', () => {
  assert.equal(startedJob(202, { id: JOB, kind: 'catalog', slug: 'kitvas-ui' }), JOB);
  const problem = { type: 'urn:kitvas:error:JOB_RUNNING', status: 409, code: 'JOB_RUNNING' };
  assert.equal(startedJob(409, problem), undefined);
  assert.equal(startedJob(409, { id: JOB }), undefined);
  for (const body of [undefined, null, 'x', [JOB], { id: 7 }, { id: '' }, {}]) {
    assert.equal(startedJob(202, body), undefined, JSON.stringify(body));
  }
});

test('a page that waits for its icons loads again when the previews of its kit are made', () => {
  const previews = (fields: Record<string, unknown> = {}): StreamEvent =>
    job({ kind: 'previews', result: null, ...fields });
  assert.equal(iconsStep('kitvas-ui', previews()), 'reload');
  assert.equal(iconsStep('kitvas-ui', previews({ state: 'failed' })), 'failed');
  assert.equal(iconsStep('kitvas-ui', previews({ state: 'cancelled' })), 'failed');
  assert.equal(iconsStep('kitvas-ui', previews({ state: 'running' })), undefined);
  assert.equal(iconsStep('mui', previews()), undefined, 'another kit');
  assert.equal(iconsStep('kitvas-ui', job()), undefined, 'a catalog job');
  assert.equal(iconsStep('kitvas-ui', { event: 'reset', data: '' }), undefined);
});
