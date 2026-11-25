// The Insert pane's previews (ADR 0075): catalog examples opened one after another in one context at
// the batch's device scale, each shot as a PNG on the page's own background. A component is its first
// element with the reach of its shadow (the rule `capture` takes); the icon sheet is its grid exactly,
// so the cells of the image are where the sheet's math puts them.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PreviewShot, ShotBatch, ShotReport } from '../../ports/browser.ts';
import { firstLine } from './playwright-images.ts';
import { NO_REACH, pageSize, REACH_MAX, shadowReach, widened } from './playwright-reach.ts';

type PlaywrightBrowser = import('playwright-core').Browser;
type PlaywrightContext = import('playwright-core').BrowserContext;
type PlaywrightPage = import('playwright-core').Page;

/** Every shot of a batch failed for one reason. */
const allFailed = (shots: readonly PreviewShot[], error: string): ShotReport[] =>
  shots.map((): ShotReport => ({ state: 'failed', error }));

/** As `inspect` and `capture` wait for one page. */
const PAGE_TIMEOUT_MS = 15_000;

const SAY = {
  failed: 'the example failed to render',
  unmarked: 'the page marked no example as shown',
  empty: 'the example rendered no element',
};

/** Runs in the page: two frames, so React has painted (the wait `inspect` uses). */
function settle(): Promise<null> {
  return new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done(null))),
  );
}

/** Runs in the page: the kit's fonts are in, so the text of a shot is set in them. */
function fontsReady(): Promise<null> {
  return document.fonts.ready.then(
    () => null,
    () => null,
  );
}

/** Runs in the page: the mark `client/frame/page/example.ts` leaves after rendering an example. */
function readMark(): string | null {
  return document.documentElement.dataset.example ?? null;
}

/**
 * Runs in the page: what a shot shows behind the example, as `#rrggbb`. A screenshot paints a
 * transparent page white, so white comes first; then the root's and the body's backgrounds, each
 * over what is below it, the way the canvas shows them.
 */
function readBackdrop(): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 1, 1);
  for (const element of [document.documentElement, document.body]) {
    if (!element) continue;
    const value = getComputedStyle(element).backgroundColor;
    // A value that is no colour would leave the fill style as it was and paint that again.
    if (!value || !CSS.supports('color', value)) continue;
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
  }
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  const pair = (channel: number): string => channel.toString(16).padStart(2, '0');
  return `#${pair(red)}${pair(green)}${pair(blue)}`;
}

/** One shot on the batch's page: open the example, find its element, write the PNG. */
async function shootOne(
  page: PlaywrightPage,
  file: string,
  shot: PreviewShot,
): Promise<ShotReport> {
  try {
    await page.goto(`${pathToFileURL(file).href}${shot.search}`, { waitUntil: 'load' });
  } catch (cause) {
    return { state: 'failed', error: firstLine(cause) };
  }
  await page.evaluate(settle);
  await page.evaluate(fontsReady);
  const mark = await page.evaluate(readMark);
  if (mark !== 'shown') {
    return { state: 'failed', error: mark === 'failed' ? SAY.failed : SAY.unmarked };
  }
  const target = page.locator(shot.target).first();
  const box = (await target.count()) > 0 ? await target.boundingBox() : null;
  if (box === null) return { state: 'failed', error: SAY.empty };
  const reach = shot.reach ? await target.evaluate(shadowReach, REACH_MAX) : NO_REACH;
  const size = await page.evaluate(pageSize);
  const onPage = { ...box, x: box.x + size.scrollX, y: box.y + size.scrollY };
  const rect = widened(onPage, reach, size);
  if (rect === undefined) return { state: 'failed', error: SAY.empty };
  const [x, y, width, height] = rect;
  mkdirSync(dirname(shot.out), { recursive: true });
  // The page's own background stays in the shot: no `omitBackground`.
  await page.screenshot({
    path: shot.out,
    fullPage: true,
    clip: { x, y, width, height },
    animations: 'disabled',
  });
  return { state: 'written', width, height, backdrop: await page.evaluate(readBackdrop) };
}

export async function shootExamples(
  browser: PlaywrightBrowser,
  input: ShotBatch,
): Promise<ShotReport[]> {
  if (input.shots.length === 0) return [];
  let context: PlaywrightContext;
  try {
    context = await browser.newContext({
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: input.scale,
    });
  } catch (cause) {
    return allFailed(input.shots, firstLine(cause));
  }
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    const reports: ShotReport[] = [];
    for (const shot of input.shots) {
      try {
        reports.push(await shootOne(page, input.page, shot));
      } catch (cause) {
        // One example that breaks the page costs its own shot, not the ones after it.
        reports.push({ state: 'failed', error: firstLine(cause) });
      }
    }
    return reports;
  } catch (cause) {
    return allFailed(input.shots, firstLine(cause));
  } finally {
    await context.close().catch(() => undefined);
  }
}
