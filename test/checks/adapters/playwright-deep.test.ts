// The deep passes of `kitvas check --deep` in a real browser, on test/fixtures/checks/deep-*.html. A
// plain list of the visible elements under #root stands in for the element list the facts walk
// leaves in the page. Skips when this machine has no browser; the pixel arithmetic runs anyway.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { CANDIDATES } from '../../../src/checks/adapters/playwright-browser.ts';
import { deepPasses, inkRatio } from '../../../src/checks/adapters/playwright-deep.ts';
import { contrast, type Pixels } from '../../../src/checks/index.ts';
import { loadDep, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { NO_BROWSER } from './site.ts';

type Playwright = typeof import('playwright-core');
type PlaywrightBrowser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;
type Size = { width: number; height: number };
type Rgb = [number, number, number];

const TEST_MS = 120_000;
const FIXTURES = join(PLUGIN_ROOT, 'test', 'fixtures', 'checks');
const PHONE: Size = { width: 390, height: 844 };
const LAPTOP: Size = { width: 1280, height: 900 };

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

/** Runs in the page: what the facts walk leaves there, the visible elements under #root in order. */
function listNodes(): number {
  const nodes = Array.from(document.querySelectorAll('#root *')).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  });
  (window as unknown as { __KITVAS_NODES__?: unknown }).__KITVAS_NODES__ = nodes;
  return nodes.length;
}

/** Runs in the page: the element's index in the list; -1 when it is not listed. */
function indexOf(selector: string): number {
  const listed = (window as unknown as { __KITVAS_NODES__?: unknown }).__KITVAS_NODES__;
  const element = document.querySelector(selector);
  return Array.isArray(listed) && element !== null ? listed.indexOf(element) : -1;
}

/** Runs in the page: what the passes must leave as they found it. */
function snapshot(): {
  root: string;
  head: string;
  text: string;
  size: number[];
  reduced: boolean;
} {
  return {
    root: document.getElementById('root')?.innerHTML ?? '',
    head: document.head.innerHTML,
    text: document.body.textContent,
    size: [window.innerWidth, window.innerHeight],
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/** Runs in the page: a button named for pausing, in the banner. */
function addPauseButton(): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Pause animation';
  document.getElementById('banner')?.append(button);
}

/** Runs in the page: the facts walk did not run, or left nothing. */
function dropNodes(): void {
  (window as unknown as { __KITVAS_NODES__?: unknown }).__KITVAS_NODES__ = undefined;
}

/** A fixture page at a size, with its element list; undefined when there is no browser. */
async function withPage<T>(
  file: string,
  size: Size,
  work: (page: Page) => Promise<T>,
  hash = '',
): Promise<T | undefined> {
  if (browser === undefined) return undefined;
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(join(FIXTURES, file)).href}${hash}`, { waitUntil: 'load' });
    assert.ok((await page.evaluate(listNodes)) > 0, file);
    return await work(page);
  } finally {
    await context.close();
  }
}

test('a fixed-size chip is clipped and a line that cannot wrap runs past the edge', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage('deep-long-text.html', PHONE, async (page) => {
    const deep = await deepPasses(page, { ...PHONE, unsure: [] });
    return {
      deep,
      chip: await page.evaluate(indexOf, '#chip'),
      tagline: await page.evaluate(indexOf, '#tagline'),
    };
  });
  if (result === undefined) return t.skip(NO_BROWSER);
  const { deep, chip, tagline } = result;
  assert.ok(chip >= 0 && tagline >= 0);
  // The heading wraps, the name has an ellipsis and the hidden text was clipped already.
  assert.deepEqual(deep.longText, { clipped: [chip], over: [tagline] });
  // The count grows on a line with room for it.
  assert.deepEqual(deep.longNumber, { clipped: [], over: [] });
});

test('a price cell of a fixed width is clipped by a long number; the text pass leaves it alone', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage('deep-long-number.html', LAPTOP, async (page) => ({
    deep: await deepPasses(page, { ...LAPTOP, unsure: [] }),
    price: await page.evaluate(indexOf, '#price'),
  }));
  if (result === undefined) return t.skip(NO_BROWSER);
  const { deep, price } = result;
  assert.ok(price >= 0);
  assert.deepEqual(deep.longNumber, { clipped: [price], over: [] });
  assert.deepEqual(deep.longText, { clipped: [], over: [] });
  // Motion and orientation are measured on the phone visit only.
  assert.equal(deep.motion, null);
  assert.equal(deep.orientation, null);
});

test('an endless animation with no reduced-motion rule still runs; the emulation is reset', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage('deep-motion.html', PHONE, async (page) => ({
    motion: (await deepPasses(page, { ...PHONE, unsure: [] })).motion,
    busy: await page.evaluate(indexOf, '#busy'),
    after: await page.evaluate(snapshot),
  }));
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.ok(result.busy >= 0);
  // The calm dot stops for reduced motion and the single pulse ends: only the busy dot is left.
  assert.deepEqual(result.motion, { running: [result.busy], autoplay: [], pause: false });
  assert.equal(result.after.reduced, false);
});

test('a pause button in the same region counts as a way to stop the motion', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage('deep-motion.html', PHONE, async (page) => {
    await page.evaluate(addPauseButton);
    await page.evaluate(listNodes);
    return {
      motion: (await deepPasses(page, { ...PHONE, unsure: [] })).motion,
      busy: await page.evaluate(indexOf, '#busy'),
    };
  });
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(result.motion, { running: [result.busy], autoplay: [], pause: true });
});

test('content hidden in landscape is counted, and the phone size is put back', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage('deep-orientation.html', PHONE, async (page) => ({
    orientation: (await deepPasses(page, { ...PHONE, unsure: [] })).orientation,
    viewport: page.viewportSize(),
    after: await page.evaluate(snapshot),
  }));
  if (result === undefined) return t.skip(NO_BROWSER);
  const found = result.orientation;
  assert.ok(found);
  assert.equal(found.rotated, false);
  // Sideways only the notice is left.
  assert.equal(found.landscape, 'Turn your phone upright.'.length);
  assert.ok(found.portrait > found.landscape * 2, JSON.stringify(found));
  assert.deepEqual(result.viewport, PHONE);
  assert.deepEqual(result.after.size, [PHONE.width, PHONE.height]);
});

test('a page that turns its body in landscape is rotated, with all its text', {
  timeout: TEST_MS,
}, async (t) => {
  const found = await withPage(
    'deep-orientation.html',
    PHONE,
    async (page) => (await deepPasses(page, { ...PHONE, unsure: [] })).orientation,
    '#rotate',
  );
  if (found === undefined) return t.skip(NO_BROWSER);
  assert.ok(found);
  assert.equal(found.rotated, true);
  assert.equal(found.landscape, found.portrait);
});

test('dark text over a dark ground samples under 4.5:1 and large white text over it', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage('deep-contrast.html', PHONE, async (page) => {
    const dim = await page.evaluate(indexOf, '#dim');
    const bright = await page.evaluate(indexOf, '#bright');
    const before = await page.evaluate(snapshot);
    // A repeated index is sampled once; an index outside the list is skipped.
    const deep = await deepPasses(page, { ...PHONE, unsure: [dim, bright, dim, 9999] });
    return { dim, bright, deep, before, after: await page.evaluate(snapshot) };
  });
  if (result === undefined) return t.skip(NO_BROWSER);
  const { dim, bright, deep } = result;
  assert.deepEqual(
    deep.contrast.map((sample) => [sample.node, sample.large]),
    [
      [dim, false],
      [bright, true],
    ],
  );
  const [low, high] = deep.contrast;
  assert.ok(low !== undefined && low.ratio > 1 && low.ratio < 4.5, JSON.stringify(low));
  assert.ok(high !== undefined && high.ratio > 4.5, JSON.stringify(high));
  assert.deepEqual(result.after, result.before);
});

test('every part puts the page back: its text, its head, its size and its media', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withPage('deep-long-text.html', PHONE, async (page) => {
    const chip = await page.evaluate(indexOf, '#chip');
    const before = await page.evaluate(snapshot);
    const deep = await deepPasses(page, { ...PHONE, unsure: [chip] });
    return { deep, before, after: await page.evaluate(snapshot) };
  });
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.match(result.before.text, /Beta/);
  assert.deepEqual(result.after, result.before);
  // The chip's text was sampled, and its transparent copy is gone again.
  assert.equal(result.deep.contrast.length, 1);
  assert.doesNotMatch(result.after.root, /data-kitvas-ink/);
  assert.notEqual(result.deep.orientation, null);
  assert.notEqual(result.deep.motion, null);
});

test('without the element list the parts that need it find nothing and the others still run', {
  timeout: TEST_MS,
}, async (t) => {
  const deep = await withPage('deep-orientation.html', PHONE, async (page) => {
    await page.evaluate(dropNodes);
    return deepPasses(page, { ...PHONE, unsure: [0, 1] });
  });
  if (deep === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(deep.longText, { clipped: [], over: [] });
  assert.deepEqual(deep.longNumber, { clipped: [], over: [] });
  assert.deepEqual(deep.contrast, []);
  assert.deepEqual(deep.motion, { running: [], autoplay: [], pause: false });
  assert.ok(deep.orientation !== null && deep.orientation.portrait > 0);
});

/** One row of pixels, opaque. */
function row(colours: Rgb[]): Pixels {
  const data = new Uint8Array(colours.length * 4);
  colours.forEach((colour, x) => {
    data.set([...colour, 255], x * 4);
  });
  return { width: colours.length, height: 1, data };
}

const floored = (ratio: number): number => Math.floor(ratio * 100) / 100;

test('the ink ratio takes the pixels that change most as the text and floors the ratio', () => {
  const ground: Rgb = [32, 32, 32];
  const white: Rgb = [255, 255, 255];
  // Four glyph pixels, one soft edge that changes less than half as much, five of ground.
  const shown = row([
    white,
    white,
    white,
    white,
    [90, 90, 90],
    ground,
    ground,
    ground,
    ground,
    ground,
  ]);
  const bare = row(Array.from({ length: 10 }, (): Rgb => ground));
  assert.equal(inkRatio(shown, bare), floored(contrast('#ffffff', '#202020')));

  // A small change is still text, so text nearly the colour of its ground is caught.
  const faint: Rgb = [38, 38, 38];
  const close = row([faint, faint, faint, faint, ground, ground]);
  assert.equal(
    inkRatio(close, row(Array.from({ length: 6 }, (): Rgb => ground))),
    floored(contrast('#262626', '#202020')),
  );
});

test('the ink ratio gives nothing for unchanged shots, too few pixels or shots of two sizes', () => {
  const ground: Rgb = [32, 32, 32];
  const white: Rgb = [255, 255, 255];
  const plain = row([ground, ground, ground, ground]);
  assert.equal(inkRatio(plain, plain), null);
  assert.equal(inkRatio(row([white, white, ground, ground]), plain), null);
  assert.equal(inkRatio(row([white, white, white, white]), row([ground, ground])), null);
});
