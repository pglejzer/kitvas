// `look` of `kit verify`: one example's catalog page opened the way `inspect` opens it, the example's
// first element shot with the reach of its shadow (the rule `kit scan` crops by, so a reference cut
// from a site and its rendering have the same size), and both images decoded to pixels on white.

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Capture, CaptureReport } from '../ports/browser.ts';
import { decodeIn, firstLine, inBlankPage, PROBLEMS } from './playwright-images.ts';
import { pageSize, REACH_MAX, shadowReach, widened } from './playwright-reach.ts';

type PlaywrightBrowser = import('playwright-core').Browser;

/** As `inspect` waits for one page. */
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

/** Runs in the page: the mark `client/frame/example.ts` leaves after rendering an example. */
function readMark(): string | null {
  return document.documentElement.dataset.example ?? null;
}

/** The example's first element with its shadow, written to `input.shot`; else a reason in `errors`. */
async function shoot(
  browser: PlaywrightBrowser,
  input: Capture,
  errors: string[],
): Promise<Uint8Array | undefined> {
  const context = await browser.newContext({
    viewport: { width: input.width, height: input.height },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${pathToFileURL(input.page).href}${input.search}`, { waitUntil: 'load' });
    } catch (cause) {
      errors.push(firstLine(cause));
      return undefined;
    }
    await page.evaluate(settle);
    const mark = await page.evaluate(readMark);
    if (mark !== 'shown') {
      errors.push(mark === 'failed' ? SAY.failed : SAY.unmarked);
      return undefined;
    }
    const root = page.locator('#root > *').first();
    const box = (await root.count()) > 0 ? await root.boundingBox() : null;
    if (box === null) {
      errors.push(SAY.empty);
      return undefined;
    }
    const reach = await root.evaluate(shadowReach, REACH_MAX);
    const size = await page.evaluate(pageSize);
    const onPage = { ...box, x: box.x + size.scrollX, y: box.y + size.scrollY };
    const rect = widened(onPage, reach, size);
    if (rect === undefined) {
      errors.push(SAY.empty);
      return undefined;
    }
    const [x, y, width, height] = rect;
    mkdirSync(dirname(input.shot), { recursive: true });
    return await page.screenshot({
      path: input.shot,
      fullPage: true,
      clip: { x, y, width, height },
      animations: 'disabled',
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function captureExample(
  browser: PlaywrightBrowser,
  input: Capture,
): Promise<CaptureReport> {
  const errors: string[] = [];
  let shot: Uint8Array | undefined;
  try {
    shot = await shoot(browser, input, errors);
  } catch (cause) {
    errors.push(firstLine(cause));
  }
  let reference: Uint8Array | undefined;
  try {
    reference = readFileSync(input.reference);
  } catch {
    errors.push(PROBLEMS.unreadable('the reference'));
  }
  if (shot === undefined && reference === undefined) {
    return { errors, rendered: undefined, reference: undefined };
  }
  try {
    return await inBlankPage(browser, async (page) => {
      const rendered =
        shot === undefined ? undefined : await decodeIn(page, shot, 'the screenshot', errors);
      const decoded =
        reference === undefined
          ? undefined
          : await decodeIn(page, reference, 'the reference', errors);
      return { errors, rendered, reference: decoded };
    });
  } catch (cause) {
    errors.push(firstLine(cause));
    return { errors, rendered: undefined, reference: undefined };
  }
}
