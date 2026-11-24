// `rework new --url` and `craft new --url`: one live page at one width in a fresh context whose
// every request and redirect passes the policy, then a screenshot, the page's facts and its
// inventory. Nothing is clicked; the page is scrolled once to the bottom and back before reading.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PAGE_HEIGHT_MAX, SCAN_TIMEOUT_MS, SETTLE_MS } from '../../domain/scan/scan-facts.ts';
import type { Survey, SurveyReport } from '../../ports/browser.ts';
import { measureFacts } from '../facts/playwright-facts.ts';
import { readInventory } from '../facts/playwright-inventory.ts';
import { firstLine } from '../images/playwright-images.ts';
import { guardRequests } from './playwright-scan-policy.ts';
import { scrollThrough, viewContext } from './playwright-scan-view.ts';

type PlaywrightBrowser = import('playwright-core').Browser;
type BrowserContext = import('playwright-core').BrowserContext;
type Page = import('playwright-core').Page;

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
  let opened: Page | undefined;
  // Routes first: web sockets are routed only in pages opened after the route.
  const guard = await guardRequests(context, input.policy, () => opened?.mainFrame());
  const page = await context.newPage();
  opened = page;
  page.setDefaultTimeout(SCAN_TIMEOUT_MS);
  // A window the page opens is no part of the survey.
  context.on('page', (other) => {
    if (other !== page) other.close().catch(() => undefined);
  });
  let status = 0;
  try {
    const response = await page.goto(input.url, { waitUntil: 'load', timeout: SCAN_TIMEOUT_MS });
    status = response?.status() ?? 0;
  } catch (cause) {
    if (guard.refused !== undefined) return blocked(guard.refused);
    return failed(guard.failure ?? cause);
  }
  if (guard.refused !== undefined) return blocked(guard.refused);
  if (status >= 400) return failed(`the page answered with status ${status}`);
  if (status >= 300) return failed(`the page answered with status ${status}`);
  await delay(SETTLE_MS);
  if (guard.refused !== undefined) return blocked(guard.refused);

  await scrollThrough(page);
  if (guard.refused !== undefined) return blocked(guard.refused);

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
