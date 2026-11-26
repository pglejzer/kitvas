import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Browser, BrowserInstaller } from '../../../src/checks/index.ts';
import { createBrowserCommand, runCli } from '../../../src/cli/index.ts';
import { KitvasError, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { tempDir } from '../../helpers/tmp.ts';

function harness(open: Browser['open'], install: BrowserInstaller['install']) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  const command = createBrowserCommand({
    browser: () => ({ open }),
    installer: () => ({ install }),
    browsersDir: '/data/browsers',
  });
  return { out, err, run: (...argv: string[]) => runCli(argv, [command], io) };
}

const found: Browser['open'] = async () => ({
  name: 'msedge',
  visit: async () => {
    throw new Error('not used');
  },
  close: async () => undefined,
});
const missing: Browser['open'] = async () => {
  throw new KitvasError('BROWSER_MISSING', { dir: '/data/browsers' });
};
const installed: BrowserInstaller['install'] = async () => '/data/browsers';

test('browser says which browser runs the checks, or how to get one', async () => {
  const yes = harness(found, installed);
  assert.equal(await yes.run('browser'), 0);
  assert.equal(yes.out.at(-1), 'Checks run in msedge.');
  assert.equal(await yes.run('browser', '--json'), 0);
  assert.deepEqual((JSON.parse(yes.out.at(-1) ?? '') as { data: unknown }).data, {
    view: 'status',
    found: 'msedge',
    dir: '/data/browsers',
  });

  const no = harness(missing, installed);
  assert.equal(await no.run('browser'), 0);
  assert.equal(
    no.out.at(-1),
    'No Chrome, Edge or Chromium found. "kitvas browser install" downloads Chromium into /data/browsers.',
  );
});

test('browser install reports the folder; a failure has its own exit code', async () => {
  const ok = harness(found, installed);
  assert.equal(await ok.run('browser', 'install'), 0);
  assert.equal(ok.out.at(-1), 'Chromium is installed in /data/browsers.');

  const failing = harness(found, async () => {
    throw new KitvasError('BROWSER_INSTALL_FAILED', { detail: 'no network' });
  });
  assert.equal(await failing.run('browser', 'install'), 15);
  assert.equal(failing.err.at(-1), 'Chromium could not be downloaded: no network');
  assert.equal(await failing.run('browser', 'nope'), 2);
});
