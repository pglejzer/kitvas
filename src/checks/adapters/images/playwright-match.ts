// `kitvas handoff compare`: the person's page opened at one width in a fresh context whose every
// request and redirect passes the policy, shot whole or cut to one element, and set beside a
// reference image. The look score decodes no image over PIXELS_MAX pixels and the person's page may
// be far taller than the draft's shot, so both are scaled by one factor first: the sizes are read from
// the PNG headers, `matchScale` says the factor, the browser cuts each image down to it, and only
// then are they decoded. The full-size shot is what is written to disk.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MATCH_HEIGHT_MAX, matchScale, pngSize } from '../../domain/kit/match-scale.ts';
import { SCAN_TIMEOUT_MS } from '../../domain/scan/scan-facts.ts';
import type { Match, MatchReport } from '../../ports/browser.ts';
import { openGuarded } from '../scan/playwright-scan-view.ts';
import { cutIn, decodeIn, firstLine, inBlankPage, PROBLEMS } from './playwright-images.ts';

type PlaywrightBrowser = import('playwright-core').Browser;
type BrowserContext = import('playwright-core').BrowserContext;
type Page = import('playwright-core').Page;

/** The page's shot, or why there is none. */
type Shot = { state: 'shot'; bytes: Uint8Array } | Exclude<MatchReport, { state: 'matched' }>;

const failed = (cause: unknown): { state: 'failed'; error: string } => ({
  state: 'failed',
  error: firstLine(cause),
});
const blocked = (url: string): { state: 'blocked'; url: string } => ({ state: 'blocked', url });

/** Runs in the page: the document's height. */
function documentHeight(): number {
  return document.documentElement.scrollHeight;
}

async function shootIn(context: BrowserContext, input: Match): Promise<Shot> {
  const visit = await openGuarded(context, input);
  if ('state' in visit) return visit;
  const { page, guard } = visit;

  let bytes: Uint8Array;
  if (input.selector === null) {
    const height = await page.evaluate(documentHeight);
    // Chromium cuts a screenshot near 16,384 px: a taller page is shot down to MATCH_HEIGHT_MAX.
    const clip =
      height > MATCH_HEIGHT_MAX
        ? { clip: { x: 0, y: 0, width: input.width, height: MATCH_HEIGHT_MAX } }
        : {};
    bytes = await page.screenshot({ fullPage: true, animations: 'disabled', ...clip });
  } else {
    const target = page.locator(input.selector).first();
    // Nothing matches, or the element has no box (hidden): there is nothing to compare.
    if ((await target.count()) === 0 || (await target.boundingBox()) === null) {
      return { state: 'missing', selector: input.selector };
    }
    bytes = await target.screenshot({ animations: 'disabled' });
  }
  if (guard.refused !== undefined) return blocked(guard.refused);
  return { state: 'shot', bytes };
}

/** One shot in a context of its own, closed before the answer whatever happens. */
async function shoot(browser: PlaywrightBrowser, input: Match): Promise<Shot> {
  let context: BrowserContext;
  try {
    context = await browser.newContext({
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      acceptDownloads: false,
      permissions: [],
    });
  } catch (cause) {
    return failed(cause);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Shot>((resolve) => {
    timer = setTimeout(
      () => resolve(failed(`no answer within ${SCAN_TIMEOUT_MS / 1000} s`)),
      SCAN_TIMEOUT_MS,
    );
  });
  const work = shootIn(context, input).catch((cause: unknown): Shot => failed(cause));
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => undefined);
  }
}

/** The image cut down to `1 / ratio` of its size, or why it could not be. */
async function scaled(
  page: Page,
  bytes: Uint8Array,
  [width, height]: [number, number],
  scale: number,
  what: string,
  errors: string[],
): Promise<Uint8Array | undefined> {
  if (scale >= 1) return bytes;
  const [cut] = await cutIn(page, bytes, [[0, 0, width, height, 1 / scale]]);
  if (cut?.ok) return cut.png;
  errors.push(cut?.error ?? PROBLEMS.decode(what));
  return undefined;
}

/** Both images scaled by one factor and decoded on white. */
async function decodePair(
  browser: PlaywrightBrowser,
  input: Match,
  shot: Uint8Array,
): Promise<MatchReport> {
  let reference: Uint8Array;
  try {
    reference = readFileSync(input.reference);
  } catch {
    return failed(PROBLEMS.unreadable('the reference'));
  }
  const shotSize = pngSize(shot);
  const referenceSize = pngSize(reference);
  if (shotSize === undefined) return failed(PROBLEMS.type('the screenshot'));
  if (referenceSize === undefined) return failed(PROBLEMS.type('the reference'));
  const scale = matchScale([shotSize, referenceSize], input.maxPixels);

  const errors: string[] = [];
  return inBlankPage(browser, async (page): Promise<MatchReport> => {
    const smallShot = await scaled(page, shot, shotSize, scale, 'the screenshot', errors);
    const rendered =
      smallShot === undefined
        ? undefined
        : await decodeIn(page, smallShot, 'the screenshot', errors);
    const smallReference = await scaled(
      page,
      reference,
      referenceSize,
      scale,
      'the reference',
      errors,
    );
    const decoded =
      smallReference === undefined
        ? undefined
        : await decodeIn(page, smallReference, 'the reference', errors);
    if (rendered === undefined || decoded === undefined) {
      return failed(errors[0] ?? PROBLEMS.decode('the image'));
    }
    return { state: 'matched', rendered, reference: decoded, scale };
  });
}

export async function matchRendered(
  browser: PlaywrightBrowser,
  input: Match,
): Promise<MatchReport> {
  const taken = await shoot(browser, input);
  if (taken.state !== 'shot') return taken;
  try {
    mkdirSync(dirname(input.shot), { recursive: true });
    writeFileSync(input.shot, taken.bytes);
  } catch {
    return failed(PROBLEMS.unwritten('the screenshot'));
  }
  try {
    return await decodePair(browser, input, taken.bytes);
  } catch (cause) {
    return failed(cause);
  }
}
