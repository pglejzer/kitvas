import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { type AddressInfo, createServer } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import type { SharedBrowser } from '../../../src/checks/index.ts';
import { serveStudio } from '../../../src/studio/run/serve.ts';
import { readState, type StudioState, writeState } from '../../../src/studio/run/state-file.ts';
import { callStudio } from '../../../src/studio/run/studio-client.ts';
import type { IdleClock } from '../../../src/studio/server/idle-stop.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';
import { fakeClock } from '../../helpers/studio/fake-clock.ts';
import { call, fakeAssets } from '../../helpers/studio/studio.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { t } from '../../helpers/translate.ts';
import { until } from '../../helpers/wait.ts';

/** The files of one project's studio in `dir`, named the way `studioFiles` names them. */
const filesIn = (dir: string) => ({
  state: join(dir, 'project.json'),
  ports: join(dir, 'project.ports.json'),
  secret: join(dir, 'project.secret'),
});

type ServeOptions = {
  browser?: () => Promise<SharedBrowser>;
  dir?: string;
  idleMinutes?: number;
  idleClock?: IdleClock;
};

/** A studio over the shop draft; runs given the same `dir` share their kept ports and secret. */
function serve(options: ServeOptions = {}) {
  const { store } = shopDraft();
  const files = filesIn(options.dir ?? join(tempDir(), 'studio'));
  const logs: string[] = [];
  let stop: () => void = () => undefined;
  const serving = serveStudio({
    drafts: store,
    kits: builtinKits(),
    t,
    assets: fakeAssets,
    version: '1.0.0',
    project: 'C:/projects/shop',
    files,
    ...(options.browser ? { browser: options.browser } : {}),
    ...(options.idleMinutes === undefined ? {} : { idleMinutes: options.idleMinutes }),
    ...(options.idleClock ? { idleClock: options.idleClock } : {}),
    log: (text) => logs.push(text),
    onStop: (fn) => {
      stop = fn;
    },
  });
  return { files, logs, serving, stop: () => stop() };
}

const STATUS = { method: 'GET', path: '/api/v1/status', timeoutMs: 2_000 } as const;

/** The page cookie (`name=value`) a browser gets from a one-time link of the studio in `state`. */
async function cookieFrom(state: StudioState): Promise<string> {
  const answer = await callStudio(state, {
    method: 'POST',
    path: '/api/v1/links',
    body: { path: '/' },
    timeoutMs: 2_000,
  });
  const link = new URL((answer.body as { url: string }).url);
  const opened = await call(state.port, { path: `${link.pathname}${link.search}` });
  assert.equal(opened.status, 303);
  return String(opened.headers['set-cookie']).split(';')[0] ?? '';
}

/** A port on 127.0.0.1 held by another server, the way another program would hold it. */
async function holdPort(): Promise<{ port: number; close(): Promise<void> }> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test('serve writes the state file the CLI reads and answers with its token', async () => {
  const run = serve();
  const state = await until(() => readState(run.files.state));
  try {
    assert.equal(state.pid, process.pid);
    assert.equal(state.version, '1.0.0');
    assert.equal(state.project, 'C:/projects/shop');
    const status = await callStudio(state, STATUS);
    assert.equal(status.status, 200);
    assert.equal((status.body as { framePort: number }).framePort, state.framePort);
    const wrong = await callStudio({ port: state.port, token: 'x'.repeat(43) }, STATUS);
    assert.equal(wrong.status, 401);
  } finally {
    run.stop();
  }
  await run.serving;
  assert.equal(readState(run.files.state), undefined);
  // The refused call is the only line; the token is never in it.
  assert.deepEqual(run.logs, [
    `denied 401 TOKEN_INVALID GET /api/v1/status host=127.0.0.1:${state.port}`,
  ]);
});

test('the shutdown route stops serve after its answer', async () => {
  const run = serve();
  const state = await until(() => readState(run.files.state));
  const answer = await callStudio(state, {
    method: 'POST',
    path: '/api/v1/shutdown',
    body: {},
    timeoutMs: 2_000,
  });
  assert.equal(answer.status, 202);
  assert.deepEqual(answer.body, { stopping: true });
  const ran = await run.serving;
  assert.equal(ran.port, state.port);
  assert.equal(readState(run.files.state), undefined);
});

test('unused for the set minutes, serve stops the way the shutdown route stops it', async () => {
  const clock = fakeClock();
  const run = serve({ idleMinutes: 2, idleClock: clock });
  const state = await until(() => readState(run.files.state));
  clock.advance(2 * 60_000 - 1);
  assert.equal(readState(run.files.state)?.pid, state.pid);
  clock.advance(1);
  const ran = await run.serving;
  assert.equal(ran.port, state.port);
  assert.equal(readState(run.files.state), undefined);
  // The log says why, in one line, without the token.
  assert.deepEqual(run.logs, [t('studio.log.idle', { minutes: 2 })]);
  assert.ok(!run.logs.join('\n').includes(state.token));
});

test("a studio that stops leaves a newer studio's file alone", async () => {
  const run = serve();
  const state = await until(() => readState(run.files.state));
  writeState(run.files.state, { ...state, pid: state.pid + 1 });
  run.stop();
  await run.serving;
  assert.equal(readState(run.files.state)?.pid, state.pid + 1);
});

test('the client gives up instead of hanging', async () => {
  await assert.rejects(callStudio({ port: 1, token: 't' }, { ...STATUS, timeoutMs: 500 }));
});

test('the shared browser of a check job is written into the state file', async () => {
  let closes = 0;
  const browser = async (): Promise<SharedBrowser> => ({
    name: 'fake',
    endpoint: 'ws://127.0.0.1:1/x',
    pid: 9001,
    closed: new Promise<void>(() => undefined),
    close: async () => {
      closes += 1;
    },
  });
  const run = serve({ browser });
  const state = await until(() => readState(run.files.state));
  assert.equal(state.browserPid, undefined);
  const answer = await callStudio(state, {
    method: 'POST',
    path: '/api/v1/drafts/shop/checks',
    body: {},
    timeoutMs: 2_000,
  });
  assert.equal(answer.status, 202);
  await until(() => readState(run.files.state)?.browserPid === 9001);
  run.stop();
  await run.serving;
  assert.equal(closes, 1);
  assert.equal(readState(run.files.state), undefined);
});

test('a second start listens on the ports of the first', async () => {
  const dir = join(tempDir(), 'studio');
  const first = serve({ dir });
  const state = await until(() => readState(first.files.state));
  first.stop();
  await first.serving;
  const saved: unknown = JSON.parse(readFileSync(first.files.ports, 'utf8'));
  assert.deepEqual(saved, { port: state.port, framePort: state.framePort });
  const second = serve({ dir });
  const again = await until(() => readState(second.files.state));
  second.stop();
  await second.serving;
  assert.equal(again.port, state.port);
  assert.equal(again.framePort, state.framePort);
});

test('a saved port that is taken falls back to a free one; the file stays', async () => {
  const dir = join(tempDir(), 'studio');
  const [studio, frame] = await Promise.all([holdPort(), holdPort()]);
  try {
    const saved = `${JSON.stringify({ port: studio.port, framePort: frame.port })}\n`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(filesIn(dir).ports, saved);
    const run = serve({ dir });
    const state = await until(() => readState(run.files.state));
    try {
      assert.notEqual(state.port, studio.port);
      assert.notEqual(state.framePort, frame.port);
      assert.equal((await callStudio(state, STATUS)).status, 200);
    } finally {
      run.stop();
    }
    await run.serving;
    // The file names the address the person bookmarked; it works again once the port is free.
    assert.equal(readFileSync(run.files.ports, 'utf8'), saved);
  } finally {
    await Promise.all([studio.close(), frame.close()]);
  }
});

test('the page secret is kept: a second start takes the cookie of the first', async () => {
  const dir = join(tempDir(), 'studio');
  const first = serve({ dir });
  const state = await until(() => readState(first.files.state));
  const cookie = await cookieFrom(state).finally(first.stop);
  await first.serving;
  const value = cookie.slice(cookie.indexOf('=') + 1);
  assert.match(value, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(first.files.secret, 'utf8').trim(), value);
  const second = serve({ dir });
  const again = await until(() => readState(second.files.state));
  try {
    // The name follows the port: the saved one, unless the system still held it at the restart.
    const page = (secret: string) =>
      call(again.port, { path: '/', headers: { cookie: `kitvas_${again.port}=${secret}` } });
    assert.equal((await page(value)).status, 200);
    assert.equal((await page('0'.repeat(64))).status, 401);
  } finally {
    second.stop();
  }
  await second.serving;
});
