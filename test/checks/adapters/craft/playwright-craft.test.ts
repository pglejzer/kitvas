// The craft pass in a real browser, on test/fixtures/checks/craft-board.html: the hash keeps the
// icon board, the hairline board or the logo board. A plain list of the visible elements under
// #root stands in for the element list the facts walk leaves in the page. Skips when this machine
// has no browser; the pixel arithmetic, the logo grounds and the grouping run anyway.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { CANDIDATES } from '../../../../src/checks/adapters/browser/playwright-browser.ts';
import {
  boardSubject,
  craftPass,
  groupReads,
  logoContrast,
  monoSketches,
  nearest,
} from '../../../../src/checks/adapters/craft/playwright-craft.ts';
import type { SvgRead } from '../../../../src/checks/adapters/craft/playwright-craft-svg.ts';
import {
  coverage,
  type Grid,
  thinnestLine,
} from '../../../../src/checks/adapters/craft/playwright-craft-thin.ts';
import { type CraftFacts, contrast, type Pixels } from '../../../../src/checks/index.ts';
import { loadDep, PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import { NO_BROWSER } from '../site.ts';

type Playwright = typeof import('playwright-core');
type PlaywrightBrowser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;

const TEST_MS = 120_000;
const BOARD = join(PLUGIN_ROOT, 'test', 'fixtures', 'checks', 'craft-board.html');
const PHONE = { width: 390, height: 844 };
const WHITE = '#ffffffff';
const DARK = '#111111ff';

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

/** Runs in the page: what the pass must leave as it found it. */
function snapshot(): { root: string; head: string; clones: boolean; list: boolean } {
  return {
    root: document.getElementById('root')?.innerHTML ?? '',
    head: document.head.innerHTML,
    clones: document.getElementById('kitvas-craft-clones') !== null,
    list: (window as unknown as { __KITVAS_CRAFT__?: unknown }).__KITVAS_CRAFT__ !== undefined,
  };
}

/** The fixture with one board kept; undefined when there is no browser. */
async function withBoard<T>(
  hash: string,
  work: (page: Page) => Promise<T>,
  listed = true,
): Promise<T | undefined> {
  if (browser === undefined) return undefined;
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(BOARD).href}${hash}`, { waitUntil: 'load' });
    if (listed) assert.ok((await page.evaluate(listNodes)) > 0, hash);
    return await work(page);
  } finally {
    await context.close();
  }
}

const KIT_ICON = {
  sketch: null,
  node: null,
  viewBox: '0 0 20 20',
  stroke: 1.75,
  filled: false,
  caps: 'round',
  fixedColours: [],
  thinnestPx16: null,
  thinnestPx32: null,
};

/** The facts without the pixel measures, which are checked by range. */
const shapes = (facts: CraftFacts['sketches']) =>
  facts.map(({ thinnestPx16: _thin16, thinnestPx32: _thin32, ...rest }) => rest);

test('icon board: viewBox, stroke, fill, caps and fixed colours of each sketch and kit icon', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withBoard('#icon', async (page) => {
    const start = await page.evaluate(snapshot);
    const craft = await craftPass(page, { subject: 'icon' });
    return {
      craft,
      subject: await boardSubject(page),
      blocks: [
        await page.evaluate(indexOf, 'section[data-craft-sketch="A"]'),
        await page.evaluate(indexOf, 'section[data-craft-sketch="B"]'),
        await page.evaluate(indexOf, 'section[data-craft-sketch="C"]'),
      ],
      start,
      end: await page.evaluate(snapshot),
    };
  });
  if (result === undefined) return t.skip(NO_BROWSER);
  const { craft, blocks } = result;
  assert.equal(result.subject, 'icon');
  assert.ok(blocks.every((block) => block >= 0));
  // Each sketch once, whatever its sizes and grounds; the hidden svg of B is not measured.
  assert.deepEqual(shapes(craft.sketches), [
    {
      sketch: 'A',
      node: blocks[0],
      viewBox: '0 0 24 24',
      stroke: 2,
      filled: false,
      caps: 'round',
      fixedColours: [],
    },
    {
      sketch: 'B',
      node: blocks[1],
      viewBox: '0 0 24 24',
      stroke: null,
      filled: true,
      caps: 'butt',
      fixedColours: [],
    },
    {
      sketch: 'C',
      node: blocks[2],
      viewBox: '0 0 20 20',
      stroke: 1.75,
      filled: true,
      caps: 'round',
      // The ink of the light ground written out is as fixed as the red.
      fixedColours: ['#111111ff', '#ff0000ff'],
    },
  ]);
  // A stroke of 2 on a 24 grid is 1.33 px at 16; a clone keeps the board's style sheet stroke.
  const [a = 0, b = 0, c = 0] = craft.sketches.map((svg) => svg.thinnestPx16 ?? 0);
  assert.ok(a >= 1 && a <= 1.6, `A: ${a}`);
  assert.ok(b >= 1, `B: ${b}`);
  assert.ok(c >= 1, `C: ${c}`);
  // Only logos are drawn at 32 px.
  assert.ok(craft.sketches.every((svg) => svg.thinnestPx32 === null));
  // Base's icons, each once although the board shows them on both grounds.
  assert.deepEqual(craft.kit, [KIT_ICON, KIT_ICON, KIT_ICON]);
  assert.deepEqual(craft.logoContrast, []);
  assert.deepEqual(craft.mono, []);
  assert.equal(craft.subject, 'icon');
  // The page is as it was: no clone, no list, no style left behind.
  assert.equal(result.end.root, result.start.root);
  assert.equal(result.end.head, result.start.head);
  assert.equal(result.end.clones, false);
  assert.equal(result.end.list, false);
});

test('hairline board: a stroke of 0.75 on a 24 grid is under one pixel at 16 px', {
  timeout: TEST_MS,
}, async (t) => {
  const craft = await withBoard('#hairline', (page) => craftPass(page, { subject: 'icon' }), false);
  if (craft === undefined) return t.skip(NO_BROWSER);
  assert.equal(craft.sketches.length, 1);
  const [hairline] = craft.sketches;
  assert.equal(hairline?.stroke, 0.75);
  // With no element list in the page, the sketch has no node: its findings are page-level.
  assert.equal(hairline?.node, null);
  const px = hairline?.thinnestPx16 ?? null;
  assert.ok(px !== null && px > 0 && px < 1, `thinnest: ${px}`);
});

test('logo board: the mono variant, the 32 px drawing and the contrast on both grounds', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withBoard('#logo', async (page) => ({
    craft: await craftPass(page, { subject: await boardSubject(page) }),
    after: await page.evaluate(snapshot),
  }));
  if (result === undefined) return t.skip(NO_BROWSER);
  const { craft } = result;
  assert.equal(craft.subject, 'logo');
  assert.deepEqual(craft.mono, ['A']);
  assert.deepEqual(
    craft.sketches.map((svg) => [svg.sketch, svg.fixedColours]),
    [
      ['A', ['#2563ebff']],
      ['A', []],
      ['B', ['#facc15ff']],
    ],
  );
  for (const svg of craft.sketches) {
    assert.ok((svg.thinnestPx16 ?? 0) >= 1, `${svg.sketch} at 16: ${svg.thinnestPx16}`);
    assert.ok((svg.thinnestPx32 ?? 0) >= 1, `${svg.sketch} at 32: ${svg.thinnestPx32}`);
  }
  const floor = (ratio: number): number => Math.floor(ratio * 100) / 100;
  // A's one-colour tone carries it on both grounds; B is faint on white.
  assert.deepEqual(craft.logoContrast, [
    { sketch: 'A', light: floor(contrast(DARK, WHITE)), dark: floor(contrast(WHITE, DARK)) },
    {
      sketch: 'B',
      light: floor(contrast('#facc15ff', WHITE)),
      dark: floor(contrast('#facc15ff', DARK)),
    },
  ]);
  assert.ok((craft.logoContrast[1]?.light ?? 3) < 3);
  assert.equal(result.after.clones, false);
});

test('a page with no board: nothing measured, and the subject is a component', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withBoard(
    '#none',
    async (page) => ({
      craft: await craftPass(page, { subject: await boardSubject(page) }),
      after: await page.evaluate(snapshot),
    }),
    false,
  );
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(result.craft, {
    subject: 'component',
    sketches: [],
    kit: [],
    logoContrast: [],
    mono: [],
  });
  assert.equal(result.after.list, false);
});

/** A grid from rows of characters: `.` is ground, a digit tenths of a pixel, `#` a whole pixel. */
function grid(rows: string[]): Grid {
  const width = rows[0]?.length ?? 0;
  const cover = new Float32Array(width * rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((mark, x) => {
      cover[y * width + x] = mark === '#' ? 1 : mark === '.' ? 0 : Number(mark) / 10;
    });
  });
  return { width, height: rows.length, cover };
}

test('thinnestLine: a stroke is as wide as a crossing of it, its rounded tip aside', () => {
  const upright = grid([
    '....2....',
    '....77...',
    '....77...',
    '....77...',
    '....77...',
    '....77...',
    '....77...',
    '....77...',
    '.........',
  ]);
  assert.equal(thinnestLine(upright), 1.4);
});

test('thinnestLine: the soft end of a bar is not its width', () => {
  const bar = grid(['.........', '.........', '.#######3', '.#######3', '.........']);
  assert.equal(thinnestLine(bar), 2);
});

test('thinnestLine: a hairline is half a pixel; nothing painted and a bad grid give null', () => {
  assert.equal(thinnestLine(grid(['..5..', '..5..', '..5..', '..5..', '..5..', '..5..'])), 0.5);
  assert.equal(thinnestLine(grid(['.....', '.....'])), null);
  assert.equal(thinnestLine({ width: 3, height: 3, cover: new Float32Array(4) }), null);
  assert.equal(thinnestLine({ width: 0, height: 0, cover: new Float32Array(0) }), null);
});

/** One row of pixels, each given as the same pixel shot on white and on black. */
function shots(pixels: [number[], number[]][]): { white: Pixels; black: Pixels } {
  const plane = (pick: 0 | 1): Pixels => ({
    width: pixels.length,
    height: 1,
    data: Uint8Array.from(pixels.flatMap((pair) => [...pair[pick], 255])),
  });
  return { white: plane(0), black: plane(1) };
}

test('coverage: the same on both grounds is painted, white and black is ground', () => {
  const { white, black } = shots([
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    [
      [51, 51, 51],
      [0, 0, 0],
    ],
    [
      [255, 255, 255],
      [0, 0, 0],
    ],
    [
      [255, 0, 0],
      [255, 0, 0],
    ],
  ]);
  const found = coverage(white, black, [0, 0, 4, 1]);
  assert.ok(found);
  assert.deepEqual(
    [...found.cover].map((value) => Math.round(value * 100) / 100),
    [1, 0.8, 0, 1],
  );
  // Part of a shot.
  const part = coverage(white, black, [1, 0, 2, 1]);
  assert.deepEqual(
    [...(part?.cover ?? [])].map((value) => Math.round(value)),
    [1, 0],
  );
});

test('coverage: shots of two sizes, or a box outside them, give null', () => {
  const { white, black } = shots([
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
  ]);
  const wider: Pixels = { width: 2, height: 1, data: new Uint8Array(8) };
  assert.equal(coverage(white, wider, [0, 0, 1, 1]), null);
  assert.equal(coverage(white, black, [0, 0, 2, 1]), null);
  assert.equal(coverage(white, black, [-1, 0, 1, 1]), null);
  assert.equal(coverage(white, black, [0, 0, 0, 1]), null);
});

/** An svg of a logo sketch, read: dark ink on white unless told otherwise. */
function read(part: Partial<SvgRead> = {}): SvgRead {
  return {
    at: 0,
    sketch: 'A',
    icon: null,
    node: null,
    mono: false,
    viewBox: '0 0 32 32',
    stroke: null,
    filled: true,
    caps: 'butt',
    fixedColours: [],
    painted: [DARK],
    ground: WHITE,
    size: 32,
    ...part,
  };
}

const floor = (ratio: number): number => Math.floor(ratio * 100) / 100;

test('logoContrast: the best tone counts on each ground, its faintest colour within it', () => {
  const found = logoContrast([
    // Colour tone: a dark and a yellow part; on white the yellow is faint.
    read({ painted: [DARK, '#facc15ff'] }),
    read({ painted: [DARK, '#facc15ff'], ground: DARK }),
    // One-colour tone: white on the dark ground.
    read({ mono: true, painted: [WHITE], ground: DARK }),
    // A kit icon is never a logo.
    read({ sketch: null, icon: 'check', painted: ['#facc15ff'], ground: DARK }),
  ]);
  assert.deepEqual(found, [
    { sketch: 'A', light: floor(contrast('#facc15ff', WHITE)), dark: floor(contrast(WHITE, DARK)) },
  ]);
});

test('logoContrast: a sketch never drawn on dark is held to the board dark ground, or black', () => {
  const onBoard = logoContrast([read({ sketch: 'A' }), read({ sketch: 'B', ground: DARK })]);
  assert.deepEqual(onBoard[0], {
    sketch: 'A',
    light: floor(contrast(DARK, WHITE)),
    dark: floor(contrast(DARK, DARK)),
  });
  const alone = logoContrast([read({ painted: ['#2563ebff'] })]);
  assert.deepEqual(alone, [
    {
      sketch: 'A',
      light: floor(contrast('#2563ebff', WHITE)),
      dark: floor(contrast('#2563ebff', '#000000ff')),
    },
  ]);
  // Painting nothing is no contrast at all.
  assert.deepEqual(logoContrast([read({ painted: [] })]), [{ sketch: 'A', light: 1, dark: 1 }]);
  assert.deepEqual(logoContrast([]), []);
});

test('monoSketches: marked and one colour, its opacities aside', () => {
  const found = monoSketches([
    read({ sketch: 'A', mono: true, painted: [DARK, '#11111180'] }),
    read({ sketch: 'A', mono: true, painted: [WHITE], ground: DARK }),
    // Marked, but two colours: not a one-colour variant.
    read({ sketch: 'B', mono: true, painted: [DARK, '#ff0000ff'] }),
    read({ sketch: 'C' }),
    read({ sketch: null, icon: 'check', mono: true }),
  ]);
  assert.deepEqual(found, ['A']);
  assert.deepEqual(monoSketches([]), []);
});

test('groupReads: one look at several sizes is one group; nearest takes the closest size', () => {
  const small = read({ at: 0, size: 16 });
  const large = read({ at: 1, size: 32, ground: DARK, painted: [WHITE] });
  const toned = read({ at: 2, size: 32, mono: true });
  const groups = groupReads([small, large, toned]);
  assert.deepEqual(
    groups.map((group) => group.map((one) => one.at)),
    [[0, 1], [2]],
  );
  assert.equal(nearest([small, large], 30)?.at, 1);
  assert.equal(nearest([small, large], 10)?.at, 0);
  assert.equal(nearest([], 16), undefined);
  assert.deepEqual(groupReads([]), []);
});
