import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SharedBrowser } from '../../../src/checks/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { keepBrowser } from '../../../src/studio/jobs/shared-browser.ts';

type Started = { browser: SharedBrowser; end(): void; closes: number };

/** Browsers that go away when the test says so. */
function fakeHost() {
  const started: Started[] = [];
  const serve = async (): Promise<SharedBrowser> => {
    let end: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      end = resolve;
    });
    const n = started.length + 1;
    const entry: Started = {
      browser: {
        name: 'fake',
        endpoint: `ws://127.0.0.1:1/${n}`,
        pid: 9000 + n,
        closed,
        close: async () => {
          entry.closes += 1;
          end();
        },
      },
      end: () => end(),
      closes: 0,
    };
    started.push(entry);
    return entry.browser;
  };
  return { serve, started };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('only checks get the browser; it starts once and is shared', async () => {
  const host = fakeHost();
  const pids: (number | undefined)[] = [];
  const keeper = keepBrowser(host.serve, (pid) => pids.push(pid));
  assert.deepEqual(await keeper.envFor(['build', 'shop']), {});
  assert.equal(host.started.length, 0);
  const [a, b] = await Promise.all([
    keeper.envFor(['check', 'shop']),
    keeper.envFor(['check', 'blog']),
  ]);
  assert.deepEqual(a, { KITVAS_BROWSER_WS: 'ws://127.0.0.1:1/1', KITVAS_BROWSER_NAME: 'fake' });
  assert.deepEqual(b, a);
  assert.equal(host.started.length, 1);
  assert.equal(keeper.pid(), 9001);
  await keeper.close();
  await tick();
  assert.equal(host.started[0]?.closes, 1);
  assert.equal(keeper.pid(), undefined);
  assert.deepEqual(pids, [9001]);
});

test('a browser that went away is started again for the next check', async () => {
  const host = fakeHost();
  const pids: (number | undefined)[] = [];
  const keeper = keepBrowser(host.serve, (pid) => pids.push(pid));
  await keeper.envFor(['check', 'shop']);
  host.started[0]?.end();
  await tick();
  assert.equal(keeper.pid(), undefined);
  const env = await keeper.envFor(['check', 'shop']);
  assert.equal(env.KITVAS_BROWSER_WS, 'ws://127.0.0.1:1/2');
  assert.deepEqual(pids, [9001, undefined, 9002]);
  await keeper.close();
});

test('a browser that cannot start fails that check only; the next one tries again', async () => {
  let fail = true;
  const host = fakeHost();
  const keeper = keepBrowser(async () => {
    if (fail) throw new KitvasError('BROWSER_MISSING', { dir: 'x' });
    return host.serve();
  });
  await assert.rejects(
    keeper.envFor(['check', 'shop']),
    (error: unknown) => error instanceof KitvasError && error.code === 'BROWSER_MISSING',
  );
  fail = false;
  await tick();
  assert.equal((await keeper.envFor(['check', 'shop'])).KITVAS_BROWSER_NAME, 'fake');
  await keeper.close();
  await keeper.close();
});
