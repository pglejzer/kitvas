// The passes of a visit in a real browser: reflow at 320 px, the focus walk with real Tab presses,
// the spacing override, and a pass that throws. The pages are in test/fixtures/checks/ (read its
// README), opened from disk as a draft's page is. Browser tests skip when there is no browser.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { newProblems } from '../../../../src/checks/adapters/facts/playwright-passes.ts';
import {
  type FactNode,
  FOCUS_STOP_CAP,
  type PageFacts,
} from '../../../../src/checks/domain/page/facts.ts';
import type { PageReport } from '../../../../src/checks/domain/page/page.ts';
import type { BrowserSession, Pass } from '../../../../src/checks/ports/browser.ts';
import { PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import { NO_BROWSER, openSession } from '../site.ts';

const TEST_MS = 120_000;
const PAGES = join(PLUGIN_ROOT, 'test', 'fixtures', 'checks');

let session: BrowserSession | undefined;

before(async () => {
  session = await openSession();
});

after(async () => {
  await session?.close();
});

/** One visit of a fixture page at 390 × 844 with no screenshot, or undefined without a browser. */
async function visit(file: string, passes: Pass[]): Promise<PageReport | undefined> {
  if (session === undefined) return undefined;
  return session.visit({
    page: join(PAGES, file),
    state: 'filled',
    width: 390,
    height: 844,
    screenshot: null,
    passes,
    options: {},
  });
}

function factsOf(report: PageReport): PageFacts {
  assert.ok(report.facts, `no facts: ${JSON.stringify(report.pageErrors)}`);
  return report.facts;
}

/** The node with this id attribute, and its index. */
function find(facts: PageFacts, id: string): { index: number; node: FactNode } {
  const index = facts.nodes.findIndex((node) => node.domId === id);
  const node = facts.nodes[index];
  assert.ok(node, `no node #${id}`);
  return { index, node };
}

/** The id attribute of each focus stop, in Tab order. */
const stopIds = (facts: PageFacts): (string | null | undefined)[] =>
  facts.focus.map((stop) => facts.nodes[stop.node]?.domId);

test('the spacing pass reports only what the override made new', () => {
  assert.deepEqual(
    newProblems(
      { clipped: [2, 5], pairs: [[1, 3]] },
      {
        clipped: [7, 5, 2, 7],
        pairs: [
          [1, 3],
          [4, 6],
          [4, 8],
          [9, 11],
        ],
      },
    ),
    { clipped: [7], overlapping: [4, 9] },
  );
  assert.deepEqual(newProblems({ clipped: [], pairs: [] }, { clipped: [], pairs: [] }), {
    clipped: [],
    overlapping: [],
  });
});

test('the focus walk stops after FOCUS_STOP_CAP presses on a long page', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('focus-cap.html', ['focus']);
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  const buttons = facts.nodes.flatMap((node, index) => (node.tag === 'button' ? [index] : []));
  assert.equal(buttons.length, 70);
  assert.deepEqual(
    facts.focus.map((stop) => stop.node),
    buttons.slice(0, FOCUS_STOP_CAP),
  );
});

test('the focus walk stops on a cycle; no indicator at all is no change', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('focus-cycle.html', ['focus']);
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  assert.deepEqual(stopIds(facts), ['first', 'plain', 'ringed']);
  const [first, plain, ringed] = facts.focus;
  // The browser's own ring.
  assert.deepEqual([first?.changed, first?.defaultRing, first?.covered], [true, true, 'none']);
  assert.equal(typeof first?.ring, 'string');
  // outline: none and nothing else: neither the computed style nor a pixel changes.
  assert.deepEqual(plain, {
    node: find(facts, 'plain').index,
    changed: false,
    ring: null,
    ringGround: '#ffffffff',
    defaultRing: false,
    covered: 'none',
  });
  // A ring of its own, drawn as a shadow on white.
  assert.deepEqual(ringed, {
    node: find(facts, 'ringed').index,
    changed: true,
    ring: '#1d4ed8ff',
    ringGround: '#ffffffff',
    defaultRing: false,
    covered: 'none',
  });
});

test('a stop under a sticky header is covered fully or partly; its own child never covers it', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('sticky.html', ['focus']);
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  assert.deepEqual(stopIds(facts), ['home', 'under', 'half', 'clear']);
  assert.deepEqual(
    facts.focus.map((stop) => stop.covered),
    ['none', 'fully', 'partly', 'none'],
  );
  assert.ok(
    facts.focus.every((stop) => stop.changed),
    JSON.stringify(facts.focus),
  );
});

test('reflow names the deepest node past 320 px; scrollers and fixed bars are exempt', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('reflow.html', ['reflow']);
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  assert.ok(facts.reflow, 'the reflow pass ran');
  assert.deepEqual(facts.reflow.over, [find(facts, 'inner').index]);
  assert.equal(facts.reflow.scrollWidth, 360);
  // The walk ran at 390, where nothing is past the edge.
  assert.equal(facts.scrollWidth, 390);
});

test('the spacing override cuts off a fixed-height button; what was cut before is not new', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('spacing.html', ['spacing']);
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  assert.deepEqual(facts.spacing, { clipped: [find(facts, 'tight').index], overlapping: [] });
  // Before the override the button showed all of its text, and #cut did not.
  const tight = find(facts, 'tight').node.scroll;
  const cut = find(facts, 'cut').node.scroll;
  assert.ok(tight !== null && tight[2] <= tight[3] + 1, JSON.stringify(tight));
  assert.ok(cut !== null && cut[2] > cut[3] + 1, JSON.stringify(cut));
});

test('a good page: nothing past 320 px, nothing cut off, every stop seen and uncovered', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('good.html', ['reflow', 'focus', 'spacing']);
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  assert.deepEqual(facts.reflow, { scrollWidth: 320, over: [] });
  assert.deepEqual(facts.spacing, { clipped: [], overlapping: [] });
  assert.equal(facts.focus.length, 3);
  assert.ok(
    facts.focus.every((stop) => stop.changed && stop.covered === 'none'),
    JSON.stringify(facts.focus),
  );
  assert.ok(facts.nodes.every((node) => !node.hidden));
  assert.deepEqual(facts.fixed, []);
  assert.deepEqual(report.contrastUnsure, []);
});

test('a pass that throws leaves its field empty, and the facts and other passes stay', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('throws.html', ['reflow', 'focus', 'spacing']);
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  assert.deepEqual(facts.focus, []);
  assert.equal(find(facts, 'go').node.action?.name, 'Go');
  assert.deepEqual(facts.reflow, { scrollWidth: 320, over: [] });
  assert.deepEqual(facts.spacing, { clipped: [], overlapping: [] });
  assert.equal(report.rendered, true);
});
