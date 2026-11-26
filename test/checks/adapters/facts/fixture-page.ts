// A real browser page on a fixture of test/fixtures/checks/ with the facts walk done, for the tests
// that call a pass directly. The walk leaves its node list and tools on the page, as a visit does.
// Skips (undefined) when this machine has no browser.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CANDIDATES } from '../../../../src/checks/adapters/browser/playwright-browser.ts';
import { measureFacts } from '../../../../src/checks/adapters/facts/playwright-facts.ts';
import type { PageFacts } from '../../../../src/checks/domain/page/facts.ts';
import { loadDep, PLUGIN_ROOT } from '../../../../src/shared/index.ts';

type Playwright = typeof import('playwright-core');
type PlaywrightBrowser = import('playwright-core').Browser;
export type Page = import('playwright-core').Page;

const PAGES = join(PLUGIN_ROOT, 'test', 'fixtures', 'checks');

let browser: PlaywrightBrowser | undefined;

/** Starts the browser; call it from `before`. */
export async function openBrowser(): Promise<void> {
  const { chromium } = await loadDep<Playwright>('playwright-core', [PLUGIN_ROOT]);
  for (const { channel } of CANDIDATES) {
    try {
      browser = await chromium.launch(channel ? { channel, headless: true } : { headless: true });
      return;
    } catch {
      // Not on this machine: try the next one.
    }
  }
}

/** Closes the browser; call it from `after`. */
export async function closeBrowser(): Promise<void> {
  await browser?.close();
}

/** The page of a fixture at this width, walked; undefined when there is no browser. */
export async function withFixture<T>(
  file: string,
  work: (page: Page, facts: PageFacts) => Promise<T>,
  width = 390,
): Promise<T | undefined> {
  if (browser === undefined) return undefined;
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(PAGES, file)).href, { waitUntil: 'load' });
    return await work(page, await measureFacts(page));
  } finally {
    await context.close();
  }
}
