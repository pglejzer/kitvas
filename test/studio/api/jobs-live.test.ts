import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SharedBrowser } from '../../../src/checks/index.ts';
import type { StudioDeps } from '../../../src/studio/index.ts';
import { openEvents } from '../../helpers/studio/events.ts';
import { ECHO_CLI, fakeCli, SLOW_CLI } from '../../helpers/studio/fake-cli.ts';
import { call, shopStudio } from '../../helpers/studio/studio.ts';
import { tempDir } from '../../helpers/tmp.ts';

type JobBody = {
  id: string;
  state: string;
  slug: string;
  result: unknown;
  error: { code: string } | null;
};

const json = <T>(text: string): T => JSON.parse(text) as T;

/** A studio whose jobs run `body` as the CLI. */
async function jobStudio(body: string, extra: Partial<StudioDeps> = {}) {
  const cli = { bin: fakeCli(body), cwd: tempDir(), env: process.env };
  const { studio, errors } = await shopStudio({}, { cli, ...extra });
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const get = (path: string) => call(studio.port, { path, headers: auth });
  const post = (path: string) =>
    call(studio.port, { method: 'POST', path, headers: write, body: '{}' });
  return { studio, errors, auth, get, post };
}

test('a build job runs the CLI, and its changes reach the events stream', async () => {
  const { studio, errors, auth, get, post } = await jobStudio(ECHO_CLI);
  try {
    const stream = await openEvents(studio.port, auth);
    assert.equal(stream.status, 200);
    const started = await post('/api/v1/drafts/shop/builds');
    assert.equal(started.status, 202);
    const job = json<JobBody>(started.text);
    assert.equal(started.headers.location, `/api/v1/jobs/${job.id}`);
    assert.equal(job.state, 'running');
    const first = await stream.next();
    assert.equal(first.event, 'job');
    assert.equal(json<JobBody>(first.data).state, 'running');
    const second = json<JobBody>((await stream.next()).data);
    assert.equal(second.state, 'succeeded');
    assert.deepEqual((second.result as { args: string[] }).args, ['build', 'shop', '--json']);
    assert.equal(json<JobBody>((await get(`/api/v1/jobs/${job.id}`)).text).state, 'succeeded');
    const list = json<{ items: JobBody[] }>((await get('/api/v1/jobs')).text);
    assert.deepEqual(
      list.items.map((item) => item.id),
      [job.id],
    );
    stream.close();
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('one build per draft; cancel stops it; unknown drafts and jobs are 404', async () => {
  const { studio, auth, post, get } = await jobStudio(SLOW_CLI);
  try {
    const stream = await openEvents(studio.port, auth);
    const job = json<JobBody>((await post('/api/v1/drafts/shop/builds')).text);
    const again = await post('/api/v1/drafts/shop/builds');
    assert.equal(again.status, 409);
    assert.equal(json<{ code: string }>(again.text).code, 'JOB_RUNNING');
    assert.equal((await post(`/api/v1/jobs/${job.id}/cancel`)).status, 202);
    assert.equal(json<JobBody>((await stream.next()).data).state, 'running');
    assert.equal(json<JobBody>((await stream.next()).data).state, 'cancelled');
    assert.equal((await post('/api/v1/drafts/nope/builds')).status, 404);
    assert.equal((await get('/api/v1/jobs/00000000-0000-4000-8000-000000000000')).status, 404);
    assert.equal((await get('/api/v1/jobs/not-a-job')).status, 404);
    const noOrigin = await call(studio.port, {
      method: 'POST',
      path: '/api/v1/drafts/shop/builds',
      headers: { ...auth, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(noOrigin.status, 403);
    stream.close();
  } finally {
    await studio.close();
  }
});

test('the stream needs the token; stopping the studio ends running jobs, then the streams', async () => {
  const { studio, auth, post } = await jobStudio(SLOW_CLI);
  const denied = await openEvents(studio.port);
  assert.equal(denied.status, 401);
  const stream = await openEvents(studio.port, auth);
  const job = json<JobBody>((await post('/api/v1/drafts/shop/builds')).text);
  assert.equal(json<JobBody>((await stream.next()).data).state, 'running');
  await studio.close();
  const last = json<JobBody>((await stream.next()).data);
  assert.equal(last.id, job.id);
  assert.equal(last.state, 'cancelled');
  await stream.text();
});

test('with every stream slot taken the studio answers 503 with Retry-After', async () => {
  const { studio } = await shopStudio({ eventLimits: { streams: 1 } });
  const auth = { authorization: `Bearer ${studio.token}` };
  try {
    const first = await openEvents(studio.port, auth);
    const second = await openEvents(studio.port, auth);
    assert.equal(second.status, 503);
    assert.equal(second.headers['retry-after'], '5');
    assert.ok(second.headers['content-security-policy']);
    assert.equal(json<{ code: string }>(await second.text()).code, 'STREAM_LIMIT');
    first.close();
  } finally {
    await studio.close();
  }
});

test('a check job gets the shared browser in its environment; the studio ends the browser', async () => {
  let closes = 0;
  const browser = async (): Promise<SharedBrowser> => ({
    name: 'fake',
    endpoint: 'ws://127.0.0.1:1/x',
    pid: undefined,
    closed: new Promise<void>(() => undefined),
    close: async () => {
      closes += 1;
    },
  });
  const { studio, auth, post } = await jobStudio(ECHO_CLI, { browser });
  try {
    const stream = await openEvents(studio.port, auth);
    const started = await post('/api/v1/drafts/shop/checks');
    assert.equal(started.status, 202);
    assert.equal(json<{ kind: string }>(started.text).kind, 'check');
    assert.equal(json<JobBody>((await stream.next()).data).state, 'running');
    const done = json<JobBody>((await stream.next()).data);
    assert.equal(done.state, 'succeeded');
    const result = done.result as { args: string[]; shared: string | null };
    assert.deepEqual(result.args, ['check', 'shop', '--json']);
    assert.equal(result.shared, 'ws://127.0.0.1:1/x');
    const build = json<JobBody>((await post('/api/v1/drafts/shop/builds')).text);
    assert.equal(json<JobBody>((await stream.next()).data).id, build.id);
    const built = json<JobBody>((await stream.next()).data);
    assert.equal((built.result as { shared: string | null }).shared, null);
    stream.close();
  } finally {
    await studio.close();
  }
  assert.equal(closes, 1);
});
