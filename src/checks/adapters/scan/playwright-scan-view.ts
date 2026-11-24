// How `kit scan` looks at a page: a phone below 768 px, and a walk down the page and back so that
// content loaded on scroll is there when the facts are read.

import { setTimeout as delay } from 'node:timers/promises';
import { SCAN_HEIGHT } from '../../domain/scan/scan-facts.ts';

type ContextOptions = import('playwright-core').BrowserContextOptions;
type Page = import('playwright-core').Page;

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
