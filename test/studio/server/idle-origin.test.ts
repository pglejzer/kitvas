import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { StudioDeps } from '../../../src/studio/index.ts';
import { openEvents } from '../../helpers/events.ts';
import { fakeCli } from '../../helpers/fake-cli.ts';
import { fakeClock } from '../../helpers/fake-clock.ts';
import { call, shopStudio } from '../../helpers/studio.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { t } from '../../helpers/translate.ts';

const MINUTE = 60_000;

/** Answers once the file named in `KITVAS_TEST_GO` exists: the test decides when the job ends. */
const WAITING_CLI = `
import { existsSync } from 'node:fs';
const go = process.env.KITVAS_TEST_GO;
const wait = setInterval(() => {
  if (!existsSync(go)) return;
  clearInterval(wait);
  console.log(JSON.stringify({ ok: true, data: {} }));
}, 20);
`;

/** A few turns of the event loop: the server has heard the end of an answer the client got. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

const stateOf = (data: string): string => (JSON.parse(data) as { state: string }).state;

/** A studio that stops itself after `minutes` of fake time; `stops` counts its shutdowns. */
async function idleStudio(minutes: number, extra: Partial<StudioDeps> = {}) {
  const clock = fakeClock();
  const logs: string[] = [];
  const counted = { stops: 0 };
  const { studio } = await shopStudio(
    { idleMinutes: minutes },
    {
      idleClock: clock,
      shutdown: () => {
        counted.stops += 1;
      },
      onLog: (line) => logs.push(line),
      ...extra,
    },
  );
  const auth = { authorization: `Bearer ${studio.token}` };
  return { studio, clock, logs, counted, auth };
}

test('requests keep the studio up, refused ones too; the events stream does not', async () => {
  const { studio, clock, logs, counted, auth } = await idleStudio(1);
  try {
    clock.advance(20_000);
    assert.equal((await call(studio.port, { path: '/api/v1/status', headers: auth })).status, 200);
    await settle();
    clock.advance(25_000);
    assert.equal((await call(studio.port, { path: '/api/v1/drafts' })).status, 401);
    await settle();
    clock.advance(55_000);
    assert.equal(counted.stops, 0, 'the request at 45 s moved the stop to 105 s');
    const stream = await openEvents(studio.port, auth);
    assert.equal(stream.status, 200);
    clock.advance(5_000);
    assert.equal(counted.stops, 1, 'an open stream is no use');
    clock.advance(10 * MINUTE);
    assert.equal(counted.stops, 1, 'it stops once');
    // Why the studio went away, and nothing else: no token, no page secret.
    assert.deepEqual(logs, [t('studio.log.idle', { minutes: 1 })]);
    assert.ok(!logs.join('\n').includes(studio.token));
    stream.close();
  } finally {
    await studio.close();
  }
});

test('a running job holds the stop off; the wait counts from its end', async () => {
  const go = join(tempDir(), 'go');
  const env = { ...process.env, KITVAS_TEST_GO: go };
  const cli = { bin: fakeCli(WAITING_CLI), cwd: tempDir(), env };
  const { studio, clock, counted, auth } = await idleStudio(1, { cli });
  try {
    const stream = await openEvents(studio.port, auth);
    const started = await call(studio.port, {
      method: 'POST',
      path: '/api/v1/drafts/shop/builds',
      headers: { ...auth, origin: studio.url, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(started.status, 202);
    assert.equal(stateOf((await stream.next()).data), 'running');
    await settle();
    clock.advance(3 * MINUTE + 30_000);
    assert.equal(counted.stops, 0, 'a job runs');
    writeFileSync(go, '');
    assert.equal(stateOf((await stream.next()).data), 'succeeded');
    clock.advance(MINUTE - 1);
    assert.equal(counted.stops, 0, 'the minute counts from the end of the job');
    clock.advance(1);
    assert.equal(counted.stops, 1);
    stream.close();
  } finally {
    await studio.close();
  }
});

test('0 minutes never stops the studio', async () => {
  const { studio, clock, counted } = await idleStudio(0);
  try {
    assert.equal(clock.pending(), 0);
    clock.advance(7 * 24 * 60 * MINUTE);
    assert.equal(counted.stops, 0);
  } finally {
    await studio.close();
  }
});

test('a studio without a way to stop keeps no idle timer', async () => {
  const clock = fakeClock();
  const { studio } = await shopStudio({ idleMinutes: 1 }, { idleClock: clock });
  try {
    assert.equal(clock.pending(), 0);
  } finally {
    await studio.close();
  }
});
