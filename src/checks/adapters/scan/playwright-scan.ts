// `kit scan`, one web page at one width: a fresh context with no stored state whose every request
// passes the policy, one navigation, the settle wait, facts read in the page and its same-origin
// frames, one full-page shot and the candidates cut out of it. Nothing is clicked; the page is
// scrolled once to the bottom and back before anything is read, and a phone width gets a phone.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type CandidateKind,
  CROPS_MAX,
  PAGE_BYTES_MAX,
  PAGE_HEIGHT_MAX,
  PER_KIND_MAX,
  ROLE_TAGS,
  SCAN_TIMEOUT_MS,
  type ScanFacts,
  TEXT_MAX,
} from '../../domain/scan/scan-facts.ts';
import type { Scan, ScanReport } from '../../ports/browser.ts';
import { type CutBox, cutIn, firstLine, inBlankPage } from '../images/playwright-images.ts';
import {
  NO_REACH,
  type PageSize,
  pageSize,
  REACH_MAX,
  roundBox,
  shadowReach,
  widened,
} from '../images/playwright-reach.ts';
import { type FrameCandidate, pickCandidates } from './playwright-scan-candidates.ts';
import {
  type Chosen,
  mergeStyles,
  numberCandidates,
  rankCandidates,
} from './playwright-scan-merge.ts';
import { findOverlays } from './playwright-scan-overlays.ts';
import { collectStyles, type FrameStyles } from './playwright-scan-styles.ts';
import { openGuarded, viewContext } from './playwright-scan-view.ts';

type PlaywrightBrowser = import('playwright-core').Browser;
type BrowserContext = import('playwright-core').BrowserContext;
type Page = import('playwright-core').Page;
type Frame = import('playwright-core').Frame;

/** The attribute the page side marks candidates with. */
const MARK = 'data-kitvas-scan';
/** A marked element that is gone by now is skipped rather than waited for. */
const LOCATE_MS = 2_000;
/** Elements read per frame, so a huge page still answers in time. */
const ELEMENTS_MAX = 20_000;
const STYLE_OPTIONS = {
  keep: 64,
  valueMax: 200,
  familyMax: 60,
  textMax: TEXT_MAX,
  elementsMax: ELEMENTS_MAX,
  varsMax: 1_600,
  roleTags: ROLE_TAGS,
};
/** A fixed or sticky element covering this share of the window is an overlay. */
const OVERLAY_SHARE = 0.3;
/** The overlays the facts name. */
const OVERLAYS_MAX = 5;
const PICK_OPTIONS = {
  overlayShare: OVERLAY_SHARE,
  attribute: MARK,
  perKind: PER_KIND_MAX + 4,
  textMax: TEXT_MAX,
  valueMax: 200,
  elementsMax: ELEMENTS_MAX,
};

type FrameRead = { frame: Frame; styles: FrameStyles; candidates: FrameCandidate[] };
/** Set when the scan has given up, so nothing is written after its answer. */
type Run = { stopped: boolean };

const failed = (cause: unknown): ScanReport => ({ state: 'failed', error: firstLine(cause) });

function originOf(url: string): string | undefined {
  try {
    const { origin } = new URL(url);
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}

/** The main frame first, then each frame of the same origin; a frame that cannot be read is left out. */
async function readFrames(page: Page): Promise<FrameRead[]> {
  const main = page.mainFrame();
  const origin = originOf(main.url());
  const frames = [main, ...page.frames().filter((frame) => frame !== main)];
  const reads: FrameRead[] = [];
  for (const frame of frames) {
    const own = frame === main;
    if (!own && (origin === undefined || originOf(frame.url()) !== origin)) continue;
    try {
      const styles = await frame.evaluate(collectStyles, STYLE_OPTIONS);
      const candidates = await frame.evaluate(pickCandidates, PICK_OPTIONS);
      reads.push({ frame, styles, candidates });
    } catch (cause) {
      // The page itself must be readable; a frame that went away is not.
      if (own) throw cause;
    }
  }
  return reads;
}

/** Each candidate's box on the page and its crop, at most PER_KIND_MAX per kind. */
async function measure(
  reads: FrameRead[],
  size: PageSize,
  shot: { width: number; height: number },
): Promise<Chosen[]> {
  const chosen: Chosen[] = [];
  const counts = new Map<CandidateKind, number>();
  for (const { frame, candidate } of rankCandidates(reads.map((read) => read.candidates))) {
    if (chosen.length >= CROPS_MAX) break;
    const count = counts.get(candidate.kind) ?? 0;
    const read = reads[frame];
    if (count >= PER_KIND_MAX || read === undefined) continue;
    const element = read.frame.locator(`[${MARK}="${candidate.mark}"]`).first();
    // Relative to the main frame's window, frame offsets included.
    const box = await element.boundingBox({ timeout: LOCATE_MS }).catch(() => null);
    if (box === null) continue;
    const reach = await element
      .evaluate(shadowReach, REACH_MAX, { timeout: LOCATE_MS })
      .catch(() => NO_REACH);
    const onPage = { ...box, x: box.x + size.scrollX, y: box.y + size.scrollY };
    const rect = widened(onPage, reach, shot);
    if (rect === undefined) continue;
    counts.set(candidate.kind, count + 1);
    chosen.push({
      kind: candidate.kind,
      box: roundBox(onPage),
      rect,
      overlay: candidate.overlay,
      text: candidate.text,
      style: candidate.style,
    });
  }
  return chosen;
}

async function scanIn(
  browser: PlaywrightBrowser,
  context: BrowserContext,
  input: Scan,
  run: Run,
): Promise<ScanReport> {
  const visit = await openGuarded(context, input);
  if ('state' in visit) return visit;
  const { page } = visit;

  const reads = await readFrames(page);
  const found = await page.evaluate(findOverlays, {
    share: OVERLAY_SHARE,
    max: OVERLAYS_MAX,
    textMax: TEXT_MAX,
    elementsMax: ELEMENTS_MAX,
  });
  const size = await page.evaluate(pageSize);
  const shotSize = {
    width: input.width,
    height: Math.min(Math.max(1, Math.floor(size.height)), PAGE_HEIGHT_MAX),
  };
  const chosen = await measure(reads, size, shotSize);
  const shot = await page.screenshot({
    fullPage: true,
    clip: { x: 0, y: 0, ...shotSize },
    animations: 'disabled',
  });
  const boxes = chosen.map(({ rect }): CutBox => [...rect, 1]);
  const cuts =
    boxes.length === 0 ? [] : await inBlankPage(browser, (blank) => cutIn(blank, shot, boxes));
  if (run.stopped) return failed('the scan was stopped');

  // The page shot counts first; crops are written while the page's bytes stay under the cap.
  mkdirSync(join(input.out, 'crops'), { recursive: true });
  let budget = PAGE_BYTES_MAX;
  if (shot.byteLength <= budget) {
    writeFileSync(join(input.out, 'page.png'), shot);
    budget -= shot.byteLength;
  }
  const kept = numberCandidates(chosen, cuts, budget);
  for (const { candidate, png } of kept) writeFileSync(join(input.out, candidate.crop), png);
  const facts: ScanFacts = {
    schemaVersion: 1,
    url: page.url(),
    width: input.width,
    ...mergeStyles(reads.map((read) => read.styles)),
    overlays: found.map(({ box, text }) => ({ box, text: { pageText: text.slice(0, TEXT_MAX) } })),
    candidates: kept.map(({ candidate }) => candidate),
  };
  return { state: 'scanned', facts };
}

/** One page at `input.width`; whatever happens, the context is closed before the answer. */
export async function scanPage(browser: PlaywrightBrowser, input: Scan): Promise<ScanReport> {
  let context: BrowserContext;
  try {
    context = await browser.newContext(viewContext(input.width));
  } catch (cause) {
    return failed(cause);
  }
  const run: Run = { stopped: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<ScanReport>((resolve) => {
    timer = setTimeout(
      () => resolve(failed(`no answer within ${SCAN_TIMEOUT_MS / 1000} s`)),
      SCAN_TIMEOUT_MS,
    );
  });
  const work = scanIn(browser, context, input, run).catch((cause: unknown) => failed(cause));
  try {
    return await Promise.race([work, late]);
  } finally {
    run.stopped = true;
    clearTimeout(timer);
    await context.close().catch(() => undefined);
  }
}
