import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { buildDraft } from '../../../src/render/index.ts';
import { loadDep, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { shopDraft } from '../../helpers/drafts.ts';
import { FIXTURE_KITS } from '../../helpers/kits.ts';
import { renderTools, writeShopSections } from '../../helpers/render.ts';
import { openLinkUrl, studioOver } from '../../helpers/studio.ts';

type Playwright = typeof import('playwright-core');

async function launch() {
  const { chromium } = await loadDep<Playwright>('playwright-core', [PLUGIN_ROOT]);
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // Not on this machine: try the next one.
    }
  }
  throw new Error('This test needs Chrome or Edge.');
}

test('a real browser shows the draft in a sandboxed frame from the second origin', async () => {
  const { store, root } = shopDraft();
  writeShopSections(join(root, 'shop'));
  const tools = renderTools();
  try {
    const kits = createFolderKitStore(FIXTURE_KITS);
    const report = await buildDraft({ drafts: store, kits, ...tools }, 'shop');
    assert.equal(report.built, true);
  } finally {
    await tools.bundler.dispose();
    await tools.styles.dispose();
  }
  const { studio, errors } = await studioOver(store);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto(await openLinkUrl(studio, '/drafts/shop'));
    assert.equal(new URL(page.url()).pathname, '/drafts/shop');
    const frame = await (await page.waitForSelector('iframe')).contentFrame();
    assert.ok(frame);
    await frame.waitForSelector('[data-ks]');
    assert.equal(await frame.evaluate(() => origin), 'null');
    const parentAccess = await frame.evaluate(() => {
      try {
        return String(parent.document.title);
      } catch {
        return 'blocked';
      }
    });
    assert.equal(parentAccess, 'blocked');
    assert.match(await frame.evaluate(() => document.body.textContent ?? ''), /State: filled/);
    assert.deepEqual(problems, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
  }
});
