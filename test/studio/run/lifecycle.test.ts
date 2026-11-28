import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KitvasError } from '../../../src/shared/index.ts';
import { ensureStudio, openLink, stopStudio, studioStatus } from '../../../src/studio/index.ts';
import { fakeLifecycle } from '../../helpers/studio/fake-lifecycle.ts';
import { SAMPLE_STATE } from '../../helpers/studio/studio-state.ts';

const OLD = { ...SAMPLE_STATE, version: '0.0.9' };
const PID = SAMPLE_STATE.pid;

test('nothing runs: a studio is started and its address returned', async () => {
  const fake = fakeLifecycle();
  assert.deepEqual(await ensureStudio(fake.deps), {
    pid: 7001,
    port: 7001,
    version: '1.1.0',
    url: 'http://kitvas.localhost:7001',
    started: true,
  });
  assert.deepEqual(fake.calls, ['spawn 7001']);
});

test('a studio of this version is reused', async () => {
  const fake = fakeLifecycle({ running: SAMPLE_STATE });
  const view = await ensureStudio(fake.deps);
  assert.equal(view.started, false);
  assert.equal(view.pid, PID);
  assert.deepEqual(fake.calls, []);
});

test('a studio of another version is stopped through its route, then a new one starts', async () => {
  const fake = fakeLifecycle({ running: OLD });
  const view = await ensureStudio(fake.deps);
  assert.equal(view.started, true);
  assert.deepEqual(fake.calls, [`shutdown ${PID}`, `remove ${PID}`, 'spawn 7001']);
});

test('a studio that ignores its route is ended by force after the wait', async () => {
  const fake = fakeLifecycle({ running: OLD, stubborn: true });
  await ensureStudio(fake.deps);
  assert.deepEqual(fake.calls, [`shutdown ${PID}`, `kill ${PID}`, `remove ${PID}`, 'spawn 7001']);
});

test('the file of a studio that does not answer goes; its process is left alone', async () => {
  const fake = fakeLifecycle({ running: SAMPLE_STATE, silent: [PID] });
  const view = await ensureStudio(fake.deps);
  assert.equal(view.started, true);
  assert.deepEqual(fake.calls, [`remove ${PID}`, 'spawn 7001']);
  assert.equal(fake.alive.has(PID), true);
});

test('a studio that never comes up is an error naming its log, and its process is ended', async () => {
  const fake = fakeLifecycle({ neverStarts: true });
  await assert.rejects(
    ensureStudio(fake.deps),
    (error: unknown) =>
      error instanceof KitvasError &&
      error.code === 'STUDIO_START_FAILED' &&
      error.params.log === 'studio/state.log',
  );
  assert.deepEqual(fake.calls, ['spawn 7001', 'kill 7001']);
});

test('status says where the studio runs; stop ends it once', async () => {
  const fake = fakeLifecycle({ running: SAMPLE_STATE });
  const url = `http://kitvas.localhost:${SAMPLE_STATE.port}`;
  assert.equal((await studioStatus(fake.deps))?.url, url);
  assert.equal((await stopStudio(fake.deps))?.pid, PID);
  assert.equal(fake.current(), undefined);
  assert.equal(await studioStatus(fake.deps), undefined);
  assert.equal(await stopStudio(fake.deps), undefined);
});

test('a browser that outlives its studio is ended too', async () => {
  const fake = fakeLifecycle({ running: { ...SAMPLE_STATE, browserPid: 9001 }, alive: [9001] });
  await stopStudio(fake.deps);
  assert.deepEqual(fake.calls, [`shutdown ${PID}`, 'kill 9001', `remove ${PID}`]);
});

test('a browser that went with its studio is left alone', async () => {
  const fake = fakeLifecycle({ running: { ...SAMPLE_STATE, browserPid: 9001 } });
  await stopStudio(fake.deps);
  assert.deepEqual(fake.calls, [`shutdown ${PID}`, `remove ${PID}`]);
});

test('a link comes from the studio that answers; without one it is an error', async () => {
  const fake = fakeLifecycle({ running: SAMPLE_STATE });
  const target = `:${SAMPLE_STATE.port}/open?code=c0de&to=%2Fdrafts%2Fshop`;
  assert.deepEqual(await openLink(fake.deps, '/drafts/shop'), {
    url: `http://kitvas.localhost${target}`,
    fallbackUrl: `http://localhost${target}`,
  });
  assert.deepEqual(fake.calls, [`link ${PID} /drafts/shop`]);
  await assert.rejects(
    openLink(fakeLifecycle().deps, '/'),
    (error: unknown) => error instanceof KitvasError && error.code === 'STUDIO_START_FAILED',
  );
});
