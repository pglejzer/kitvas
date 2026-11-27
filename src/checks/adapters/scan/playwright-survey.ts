// `rework new --url` and `craft new --url`: one live page at one width in a fresh context whose
// every request and redirect passes the policy, then a screenshot, the page's facts and its
// inventory. Nothing is clicked; the page is scrolled once to the bottom and back before reading.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PAGE_HEIGHT_MAX, SCAN_TIMEOUT_MS } from '../../domain/scan/scan-facts.ts';
import type { Survey, SurveyReport } from '../../ports/browser.ts';
import { measureFacts } from '../facts/playwright-facts.ts';
import { readInventory } from '../facts/playwright-inventory.ts';
import { firstLine } from '../images/playwright-images.ts';
import { openGuarded, viewContext } from './playwright-scan-view.ts';

type PlaywrightBrowser = import('playwright-core').Browser;
type BrowserContext = import('playwright-core').BrowserContext;

const failed = (cause: unknown): SurveyReport => ({ state: 'failed', error: firstLine(cause) });
const blocked = (url: string): SurveyReport => ({ state: 'blocked', url });

/** Runs in the page: the document's height. */
function documentHeight(): number {
  return document.documentElement.scrollHeight;
}

/** Runs in the page: whether a viewport meta with a `width=` is there. */
function hasViewportMeta(): boolean {
  const meta = document.querySelector('meta[name="viewport"]');
  return (meta?.getAttribute('content') ?? '').includes('width=');
}

async function surveyIn(context: BrowserContext, input: Survey): Promise<SurveyReport> {
  const visit = await openGuarded(context, input);
  if ('state' in visit) return visit;
  const { page, guard } = visit;

  const height = await page.evaluate(documentHeight);
  const shot = await page.screenshot({
    fullPage: height <= PAGE_HEIGHT_MAX,
    animations: 'disabled',
  });
  const facts = await measureFacts(page, { root: 'page' });
  const inventory = await page.evaluate(readInventory, { width: input.width });
  const viewportMeta = await page.evaluate(hasViewportMeta);
  if (guard.refused !== undefined) return blocked(guard.refused);

  mkdirSync(dirname(input.shot), { recursive: true });
  writeFileSync(input.shot, shot);
  return { state: 'surveyed', facts, inventory, viewportMeta };
}

/** One page at `input.width`; whatever happens, the context is closed before the answer. */
export async function surveyPage(browser: PlaywrightBrowser, input: Survey): Promise<SurveyReport> {
  let context: BrowserContext;
  try {
    context = await browser.newContext({
      ...viewContext(input.width),
      viewport: { width: input.width, height: input.height },
    });
  } catch (cause) {
    return failed(cause);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<SurveyReport>((resolve) => {
    timer = setTimeout(
      () => resolve(failed(`no answer within ${SCAN_TIMEOUT_MS / 1000} s`)),
      SCAN_TIMEOUT_MS,
    );
  });
  const work = surveyIn(context, input).catch((cause: unknown) => failed(cause));
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => undefined);
  }
}
