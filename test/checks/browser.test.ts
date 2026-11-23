import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createBrowserInstaller } from '../../src/checks/adapters/browser-installer.ts';
import { createPlaywrightBrowser } from '../../src/checks/adapters/playwright-browser.ts';
import { KitvasError, PLUGIN_ROOT } from '../../src/shared/index.ts';
import { checkShop } from '../helpers/checks.ts';
import { tempDir } from '../helpers/tmp.ts';

const browser = createPlaywrightBrowser({
  roots: [PLUGIN_ROOT],
  browsersDir: join(tempDir(), 'browsers'),
});

const HERO = [
  "import { Button } from '@kit';",
  '',
  'export function Hero({ state }: { state: string }) {',
  '  return (',
  '    <section className="hero">',
  '      <h1>Shop</h1>',
  '      <p>State: {state}</p>',
  '      <img src="../img/missing.png" />',
  '      <Button variant="ghost" sizes="x">Buy</Button>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

test('a clean draft passes in a real browser and gets a screenshot per width', async () => {
  const shop = checkShop({ browser });
  try {
    const report = await shop.check();
    assert.deepEqual(report.findings, []);
    assert.deepEqual(report.checks, {
      build: 'ran',
      types: 'ran',
      ds: 'ran',
      a11y: 'ran',
      ui: 'ran',
      ux: 'ran',
      runtime: 'ran',
    });
    assert.ok(
      ['chrome', 'msedge', 'chromium'].includes(report.browser ?? ''),
      String(report.browser),
    );
    assert.deepEqual(
      report.shots.map((shot) => shot.file),
      ['build/shots/filled-390.png', 'build/shots/filled-1280.png'],
    );
    for (const shot of report.shots) {
      assert.ok(existsSync(join(shop.dir, 'v1', ...shot.file.split('/'))), shot.file);
    }
  } finally {
    await shop.close();
  }
});

test('the browser finds missing alt text, a missing file and catalog misuse', async () => {
  const shop = checkShop({ browser });
  try {
    shop.write('src/tsx/sections/Hero.tsx', HERO);
    const report = await shop.check();
    const find = (rule: string) => report.findings.find((finding) => finding.rule === rule);

    const alt = find('a11y/image-alt');
    assert.equal(alt?.severity, 'fix');
    assert.equal(alt?.element, 'sections/Hero:section/img');
    assert.deepEqual([alt?.file, alt?.line], ['src/tsx/sections/Hero.tsx', 8]);
    assert.deepEqual(alt?.widths, [390, 1280]);

    assert.match(
      find('runtime/request-failed')?.message ?? '',
      /^build\/img\/missing\.png could not be loaded/,
    );
    assert.equal(
      find('ds/bad-value')?.message,
      '"ghost" is not a value of variant on Button. It takes: solid, plain.',
    );
    assert.equal(find('ds/bad-value')?.element, 'sections/Hero:section/Button');
    assert.equal(
      find('ds/unknown-prop')?.message,
      '"sizes" is not a prop of Button in the kit\'s catalog.',
    );
    assert.equal(find('runtime/console-error'), undefined);
  } finally {
    await shop.close();
  }
});

test('the installer runs playwright-core with kitvas folder and reports a failure', async () => {
  const dir = join(tempDir(), 'browsers');
  const calls: { args: string[]; folder: string | undefined }[] = [];
  const ok = createBrowserInstaller({
    roots: [PLUGIN_ROOT],
    browsersDir: dir,
    run: async (_command, args, env) => {
      calls.push({ args, folder: env.PLAYWRIGHT_BROWSERS_PATH });
      return { code: 0, errors: '' };
    },
  });
  assert.equal(await ok.install(), dir);
  assert.deepEqual(calls[0]?.args.slice(1), [
    'install',
    '--only-shell',
    '--no-progress',
    'chromium',
  ]);
  assert.ok(calls[0]?.args[0]?.endsWith('cli.js'));
  assert.equal(calls[0]?.folder, dir);

  const failing = createBrowserInstaller({
    roots: [PLUGIN_ROOT],
    browsersDir: dir,
    run: async () => ({ code: 1, errors: 'no network\n' }),
  });
  await assert.rejects(
    failing.install(),
    (error: unknown) =>
      error instanceof KitvasError &&
      error.code === 'BROWSER_INSTALL_FAILED' &&
      error.params.detail === 'no network',
  );
});
