// "Full check ran 3 minutes ago" and Run again (plan 18f, task 4; spec S4.8). The server draws the
// time of the check as `data-checks-ran` (milliseconds) and the buttons as `data-checks-run`; this
// paints the words and the state of both from the pane host's `data-checks-run` (idle, running,
// done, failed), which the live checks keep (`../live/view.ts`). A running job says so and the
// buttons wait; when it ends the page swaps the new result in (`../live/check.ts`), whose buttons
// are painted here again. The host is never swapped, so the state holds across the swap.

import { text } from '../texts.ts';
import { ranAgo } from './ran.ts';

/** How often the "ago" words are made again. */
const TICK_MS = 30_000;

/** The pane host: where the checks pane is drawn. */
const REGION = '[data-shell="checks"]';

function said(status: string, at: number, now: number): string {
  if (status === 'running') return text('live.check.running');
  if (status === 'failed') return text('live.check.failed');
  if (!Number.isFinite(at) || at <= 0) return '';
  const ago = ranAgo(at, now);
  return text(ago.key, { count: ago.count });
}

/** Puts the words of the time since the check, and the state of the run buttons, in the pane. */
export function paintRun(region: HTMLElement, now: number = Date.now()): void {
  const status = region.dataset.checksRun ?? 'idle';
  for (const line of region.querySelectorAll<HTMLElement>('[data-checks-ran]')) {
    const words = said(status, Number(line.dataset.checksRan), now);
    if (line.textContent !== words) line.textContent = words;
  }
  const running = status === 'running';
  for (const run of region.querySelectorAll<HTMLButtonElement>('button[data-checks-run]')) {
    if (run.dataset.idle === undefined) run.dataset.idle = run.textContent ?? '';
    const label = running ? text('checks.run.running') : run.dataset.idle;
    if (run.textContent !== label) run.textContent = label;
    run.disabled = running;
    run.setAttribute('aria-busy', running ? 'true' : 'false');
  }
}

/** Sets the run state of the pane at `main` and paints it; the pane is left alone when absent. */
export function setRunState(main: ParentNode, status: string): void {
  const region = main.querySelector<HTMLElement>(REGION);
  if (!region || region.dataset.checksRun === status) return;
  region.dataset.checksRun = status;
  paintRun(region);
}

/**
 * Keeps the words of the time since the check up to date, on every page that has the pane (an older
 * version too): once when a new pane is swapped in, then every half minute.
 */
export function mountRan(main: HTMLElement): void {
  const region = main.querySelector<HTMLElement>(REGION);
  if (!region || region.dataset.checksRanReady !== undefined) return;
  region.dataset.checksRanReady = '';
  new MutationObserver(() => paintRun(region)).observe(region, { childList: true });
  const timer = setInterval(() => {
    if (!region.isConnected) clearInterval(timer);
    else paintRun(region);
  }, TICK_MS);
  paintRun(region);
}
