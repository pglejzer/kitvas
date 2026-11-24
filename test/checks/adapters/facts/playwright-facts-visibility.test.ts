// What the facts walk marks hidden for lying off the page or cut away by an ancestor (plan 12, C4),
// and its two roots: a draft's #root and the body of any page. The pages are in
// test/fixtures/checks/ (read its README), opened from disk at 390 × 844. `measureFacts` is called
// on the page directly, so a test can choose the root. Skips when this machine has no browser.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { CANDIDATES } from '../../../../src/checks/adapters/browser/playwright-browser.ts';
import {
  type FactsOptions,
  measureFacts,
} from '../../../../src/checks/adapters/facts/playwright-facts.ts';
import type { FactsWindow } from '../../../../src/checks/adapters/facts/playwright-facts-walk.ts';
import type { FactNode, PageFacts } from '../../../../src/checks/domain/page/facts.ts';
import { loadDep, PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import { NO_BROWSER } from '../site.ts';

type Playwright = typeof import('playwright-core');
type PlaywrightBrowser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;

const TEST_MS = 120_000;
const PAGES = join(PLUGIN_ROOT, 'test', 'fixtures', 'checks');

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

/** A page at 390 × 844 on a fixture, or blank for null; undefined when there is no browser. */
async function withPage<T>(
  file: string | null,
  work: (page: Page) => Promise<T>,
): Promise<T | undefined> {
  if (browser === undefined) return undefined;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    if (file !== null) {
      await page.goto(pathToFileURL(join(PAGES, file)).href, { waitUntil: 'load' });
    }
    return await work(page);
  } finally {
    await context.close();
  }
}

/** The facts of a fixture page, or undefined without a browser. */
function factsOf(file: string, options?: FactsOptions): Promise<PageFacts | undefined> {
  return withPage(file, (page) => measureFacts(page, options));
}

/** The node with this id attribute, and its index. */
function find(facts: PageFacts, id: string): { index: number; node: FactNode } {
  const index = facts.nodes.findIndex((node) => node.domId === id);
  const node = facts.nodes[index];
  assert.ok(node, `no node #${id}`);
  return { index, node };
}

/** The id attribute of every hidden node, in walk order. */
const hiddenIds = (facts: PageFacts): (string | null)[] =>
  facts.nodes.filter((node) => node.hidden).map((node) => node.domId);

/** Runs in the page: what the walk left there, and its index and hidden check of elements. */
function readLeft(ids: string[]): {
  count: number;
  nodes: { index: number; hidden: boolean | null }[];
} {
  const scope = window as unknown as FactsWindow;
  const tools = scope.__KITVAS_TOOLS__;
  return {
    count: scope.__KITVAS_NODES__?.length ?? -1,
    nodes: ids.map((id) => {
      const element = document.getElementById(id);
      if (element === null || tools === undefined) return { index: -1, hidden: null };
      return { index: tools.index(element), hidden: tools.hidden(element) };
    }),
  };
}

/** Runs in the page: what the draft walk always listed, each element with a box under #root. */
function countBoxed(): number {
  return Array.from(document.querySelectorAll('#root *')).filter((element) => {
    const rect = element.getBoundingClientRect();
    const { visibility } = getComputedStyle(element);
    return (
      rect.width > 0 && rect.height > 0 && visibility !== 'hidden' && visibility !== 'collapse'
    );
  }).length;
}

test('off the page: cards at x = -3554 and above the page are hidden, one partly on it shows', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await factsOf('offpage.html', { root: 'page' });
  if (facts === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(find(facts, 'far').node.box, [-3554, 100, 300, 200]);
  assert.deepEqual(find(facts, 'above').node.box, [16, -500, 300, 200]);
  assert.deepEqual(find(facts, 'edge').node.box, [-100, 400, 300, 200]);
  // The cards' text goes with them.
  assert.deepEqual(hiddenIds(facts), ['far', 'far-text', 'above', 'above-text']);
  // Nothing past the left or top edge widens the page.
  assert.equal(facts.scrollWidth, 390);
});

test("root 'page' walks the body of a page with no #root; the draft walk finds nothing there", {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage('offpage.html', async (page) => ({
    draft: await measureFacts(page),
    page: await measureFacts(page, { root: 'page' }),
    left: await page.evaluate(readLeft, ['far', 'edge']),
  }));
  if (result === undefined) return t.skip(NO_BROWSER);
  const { draft, page: walked, left } = result;
  assert.deepEqual([draft.nodes, draft.truncated], [[], false]);

  assert.deepEqual(
    walked.nodes.map((node) => node.domId),
    ['main', 'title', 'far', 'far-text', 'above', 'above-text', 'edge', 'edge-text'],
  );
  assert.equal(walked.truncated, false);
  const main = find(walked, 'main');
  assert.deepEqual([main.index, main.node.parent, main.node.landmark], [0, -1, 'main']);
  assert.deepEqual(main.node.box, [0, 0, 390, 67]);
  assert.deepEqual(find(walked, 'title').node.box, [16, 16, 358, 35]);
  const far = find(walked, 'far');
  assert.equal(far.node.parent, main.index);
  assert.equal(find(walked, 'far-text').node.parent, far.index);
  // What the walk leaves in the page names the same nodes and judges them the same.
  assert.deepEqual(left, {
    count: 8,
    nodes: [
      { index: far.index, hidden: true },
      { index: find(walked, 'edge').index, hidden: false },
    ],
  });
});

test('cut away: a slide past the edge of an overflow: hidden track is hidden, one inside is not', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await factsOf('offpage-clip.html');
  if (facts === undefined) return t.skip(NO_BROWSER);
  const hidden = (id: string): boolean => find(facts, id).node.hidden;
  const left = (id: string): number => find(facts, id).node.box[0];
  assert.equal(hidden('track'), false);
  // In the track and past its edge, then the live page's row moved 3570 px left.
  const slides = ['inside', 'past', 'moved', 'current'];
  assert.deepEqual(slides.map(hidden), [false, true, true, false]);
  assert.deepEqual(slides.map(left), [16, 226, -3554, 16]);
  // Judged on the axis that is cut: the band cuts across only, the shutter both ways.
  assert.deepEqual(['beside', 'below', 'lit', 'under'].map(hidden), [true, false, false, true]);
  // Placed against a holder outside the track, a box is not cut by it; against the track, it is.
  assert.deepEqual(['escape', 'trapped'].map(hidden), [false, true]);
  assert.deepEqual(['escape', 'trapped'].map(left), [246, 246]);
  // Past a scroller's edge, even past the page's own, a slide is a swipe away.
  assert.deepEqual(['first', 'second', 'later'].map(hidden), [false, false, false]);
  assert.equal(left('later'), 436);
  assert.equal(facts.scrollWidth, 390);
});

test('the draft walk is unchanged: the same nodes by default and with root draft', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage('labels.html', async (page) => ({
    plain: await measureFacts(page),
    draft: await measureFacts(page, { root: 'draft' }),
    boxed: await page.evaluate(countBoxed),
  }));
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(result.draft, result.plain);
  assert.equal(result.plain.nodes.length, result.boxed);
  // Only the visually hidden label and span and the span clipped to nothing, as in 3a.
  assert.deepEqual(hiddenIds(result.plain), ['search-label', 'visually', 'inset']);

  const text = await factsOf('text.html');
  assert.ok(text);
  assert.deepEqual(
    text.nodes.map((node) => [node.tag, node.domId, node.hidden]),
    [
      ['article', null, false],
      ['p', 'para', false],
      ['p', 'truth', false],
    ],
  );
});

test('a blank page has no nodes from either root; a closed page fails', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage(null, async (page) => {
    const draft = await measureFacts(page);
    const body = await measureFacts(page, { root: 'page' });
    await page.close();
    const closed = await measureFacts(page).then(
      () => 'measured',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    return { draft, body, closed };
  });
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual([result.draft.nodes, result.body.nodes], [[], []]);
  assert.deepEqual([result.body.viewport, result.body.truncated], [[390, 844], false]);
  assert.match(result.closed, /closed/i);
});
