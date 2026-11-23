import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createPlaywrightBrowser } from '../../src/checks/adapters/playwright-browser.ts';
import { createPlaywrightHost } from '../../src/checks/adapters/playwright-host.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { checkShop } from '../helpers/checks.ts';
import { tempDir } from '../helpers/tmp.ts';

const options = { roots: [PLUGIN_ROOT], browsersDir: join(tempDir(), 'browsers') };
const NAMES = ['chrome', 'msedge', 'chromium'];

test('checks connect to a shared browser on 127.0.0.1 and leave it running', async () => {
  const shared = await createPlaywrightHost(options).serve();
  try {
    assert.match(shared.endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/./);
    assert.ok(NAMES.includes(shared.name), shared.name);
    assert.ok(shared.pid);
    const browser = createPlaywrightBrowser({
      ...options,
      shared: { name: 'shared-test', endpoint: shared.endpoint },
    });
    for (const round of [1, 2]) {
      const shop = checkShop({ browser });
      try {
        const report = await shop.check();
        assert.equal(report.browser, 'shared-test', `round ${round}`);
        assert.deepEqual(report.findings, []);
      } finally {
        await shop.close();
      }
    }
  } finally {
    await shared.close();
  }
  await shared.closed;
});

test('a shared browser that is gone is replaced by one of the check itself', async () => {
  const browser = createPlaywrightBrowser({
    ...options,
    shared: { name: 'gone', endpoint: 'ws://127.0.0.1:1/none' },
  });
  const shop = checkShop({ browser });
  try {
    const report = await shop.check();
    assert.ok(NAMES.includes(report.browser ?? ''), String(report.browser));
  } finally {
    await shop.close();
  }
});
