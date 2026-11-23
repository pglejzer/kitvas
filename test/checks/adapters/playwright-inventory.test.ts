// The page inventory in a real browser, on test/fixtures/checks/inventory.html opened from disk.
// Skips when this machine has no browser.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { CANDIDATES } from '../../../src/checks/adapters/playwright-browser.ts';
import { readInventory } from '../../../src/checks/adapters/playwright-inventory.ts';
import type { InventoryItem } from '../../../src/checks/domain/inventory.ts';
import { loadDep, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { NO_BROWSER } from './site.ts';

type Playwright = typeof import('playwright-core');
type PlaywrightBrowser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;

const TEST_MS = 120_000;
const WIDTH = 1280;
const FIXTURE = join(PLUGIN_ROOT, 'test', 'fixtures', 'checks', 'inventory.html');

let browser: PlaywrightBrowser | undefined;

before(async () => {
  const { chromium } = await loadDep<Playwright>('playwright-core', [PLUGIN_ROOT]);
  for (const { channel } of CANDIDATES) {
    try {
      browser = await chromium.launch(channel ? { channel, headless: true } : { headless: true });
      return;
    } catch {
      // Not on this machine: try the next one.
    }
  }
});

after(async () => {
  await browser?.close();
});

/** Reads a page the test sets up; undefined without a browser. */
async function read(setup: (page: Page) => Promise<void>): Promise<InventoryItem[] | undefined> {
  if (browser === undefined) return undefined;
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 800 } });
  try {
    await setup(page);
    return await page.evaluate(readInventory, { width: WIDTH });
  } finally {
    await page.close();
  }
}

const item = (
  kind: InventoryItem['kind'],
  text: string,
  extra: { href?: string; level?: number } = {},
): InventoryItem => ({ kind, text, ...extra, width: WIDTH, read: 'measured' });

test('the fixture page lists what a person sees, in document order, and nothing hidden', {
  timeout: TEST_MS,
}, async (t) => {
  const items = await read(async (page) => {
    await page.goto(pathToFileURL(FIXTURE).href);
  });
  if (items === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(items, [
    item('link', 'Acme home', { href: '/' }),
    item('brand', 'Acme logo'),
    item('link', 'Pricing', { href: '/pricing' }),
    item('link', 'About us', { href: '/about' }),
    item('heading', 'Build calm pages', { level: 1 }),
    item('text', 'Kitvas turns any page into a plain list of what a person can see.'),
    item('image', 'Team at work'),
    item('heading', 'Plans', { level: 2 }),
    item('price', '$1,299.00'),
    item('price', '15 €'),
    item('action', 'Close dialog'),
    item('field', 'Work email'),
    item('field', 'Search plans'),
    item('action', 'Start free'),
    item('link', 'Contact sales', { href: '/contact' }),
  ]);
});

test('an empty page lists nothing', { timeout: TEST_MS }, async (t) => {
  const items = await read((page) => page.setContent('<!doctype html><body></body>'));
  if (items === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(items, []);
});

test('the same text twice is one item, and a list is cut at 400 items', {
  timeout: TEST_MS,
}, async (t) => {
  const twice = await read((page) =>
    page.setContent('<!doctype html><body><h2>Same</h2><h2>Same</h2><a href="/a">Same</a></body>'),
  );
  if (twice === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(twice, [
    item('heading', 'Same', { level: 2 }),
    item('link', 'Same', { href: '/a' }),
  ]);

  const many = await read((page) =>
    page.setContent(
      `<!doctype html><body>${Array.from({ length: 450 }, (_, n) => `<h2>Heading ${n}</h2>`).join('')}</body>`,
    ),
  );
  assert.ok(many);
  assert.equal(many.length, 400);
  assert.deepEqual(many[0], item('heading', 'Heading 0', { level: 2 }));
});
