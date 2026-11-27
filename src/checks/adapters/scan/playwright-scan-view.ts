// How `kit scan` looks at a page: a phone below 768 px, one guarded navigation, and a walk down the
// page and back so that content loaded on scroll is there when the facts are read. `rework new`,
// `craft new` and `handoff compare` open their page the same way.

import { setTimeout as delay } from 'node:timers/promises';
import { SCAN_HEIGHT, SCAN_TIMEOUT_MS, SETTLE_MS } from '../../domain/scan/scan-facts.ts';
import type { ScanPolicy } from '../../ports/browser.ts';
import { firstLine } from '../images/playwright-images.ts';
import { type Guard, guardRequests } from './playwright-scan-policy.ts';

type BrowserContext = import('playwright-core').BrowserContext;
type ContextOptions = import('playwright-core').BrowserContextOptions;
type Page = import('playwright-core').Page;

/** Why there is no page to read: the policy refused an address, or the page did not answer. */
export type NoPage = { state: 'blocked'; url: string } | { state: 'failed'; error: string };

/** Widths below this are a phone: sites serve their phone layout to a phone's user agent. */
export const PHONE_MAX_WIDTH = 768;
/** A current Android Chrome phone; one place to change when sites stop recognising it. */
export const PHONE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
/** The scroll to the bottom: viewport-sized steps, none more than this many, this far apart. */
export const SCROLL_STEPS_MAX = 30;
export const SCROLL_STEP_MS = 150;
/** Wait after the walk, for what the last step started loading. */
export const AFTER_SCROLL_MS = 500;

/** The context of one scan: a phone from 390 px, a desktop window otherwise. CSS pixels both ways. */
export function viewContext(width: number): ContextOptions {
  const phone = width < PHONE_MAX_WIDTH;
  return {
    viewport: { width, height: SCAN_HEIGHT },
    deviceScaleFactor: 1,
    ...(phone ? { userAgent: PHONE_USER_AGENT, isMobile: true, hasTouch: true } : {}),
    serviceWorkers: 'block',
    acceptDownloads: false,
    permissions: [],
  };
}

/** Down in viewport steps, back to the top, then a short wait. */
export async function scrollThrough(page: Page): Promise<void> {
  for (let step = 0; step < SCROLL_STEPS_MAX; step += 1) {
    const atBottom = await page.evaluate(() => {
      window.scrollBy({ top: window.innerHeight, behavior: 'instant' });
      return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
    });
    await delay(SCROLL_STEP_MS);
    if (atBottom) break;
  }
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await delay(AFTER_SCROLL_MS);
}

/**
 * The context's one page at `url`, with every request and redirect under the policy: loaded,
 * settled and scrolled through. The caller asks `guard.refused` once more after its own reads.
 */
export async function openGuarded(
  context: BrowserContext,
  input: { url: string; policy: ScanPolicy },
): Promise<{ page: Page; guard: Guard } | NoPage> {
  const failed = (cause: unknown): NoPage => ({ state: 'failed', error: firstLine(cause) });
  const blocked = (url: string): NoPage => ({ state: 'blocked', url });
  let opened: Page | undefined;
  // Routes first: web sockets are routed only in pages opened after the route.
  const guard = await guardRequests(context, input.policy, () => opened?.mainFrame());
  const page = await context.newPage();
  opened = page;
  page.setDefaultTimeout(SCAN_TIMEOUT_MS);
  // A window the page opens is no part of the visit.
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
  // A redirect the browser followed ends at its last answer, so 3xx here was not followed.
  if (status >= 300) return failed(`the page answered with status ${status}`);
  await delay(SETTLE_MS);
  // The page may have tried to go somewhere else while it settled.
  if (guard.refused !== undefined) return blocked(guard.refused);

  // Lazy content appears while scrolling; the caller reads from the top again.
  await scrollThrough(page);
  if (guard.refused !== undefined) return blocked(guard.refused);
  return { page, guard };
}
