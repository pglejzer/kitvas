// When the studio goes away (it stopped by itself after a while unused, ADR 0042, or someone ran
// `kitvas studio stop`), an open page says so instead of going quiet, and loads itself again once
// the studio is back. These are the decisions only; `live.ts` changes the page.

import type { StreamHealth } from './sse.ts';

/** How long the stream may stay lost before the page shows the paused view. */
export const PAUSE_AFTER_MS = 15_000;

/** One-shot timers; tests pass their own, so nothing waits 15 s. */
export type PauseTimer = {
  /** Calls `fn` once after `ms`; the function it returns cancels that call. */
  after(ms: number, fn: () => void): () => void;
};

export type PauseActions = {
  /** Shows the paused view in place of the page. */
  show(): void;
  /** Loads the page again: the studio is back. */
  reload(): void;
};

/**
 * The stream's health turned into the paused view: 15 s after the stream was lost, with no open
 * since, the view shows; the next open then reloads the page, so it shows the studio as it is
 * now. An open before the 15 s are over changes nothing on the page.
 */
export function watchPause(actions: PauseActions, timer: PauseTimer): StreamHealth {
  let paused = false;
  let cancel: (() => void) | undefined;
  return {
    opened() {
      cancel?.();
      cancel = undefined;
      if (!paused) return;
      paused = false;
      actions.reload();
    },
    lost() {
      // The 15 s count from the first loss: the failed reconnects after it do not restart them.
      if (paused || cancel) return;
      cancel = timer.after(PAUSE_AFTER_MS, () => {
        cancel = undefined;
        paused = true;
        actions.show();
      });
    },
  };
}
