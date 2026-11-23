// Live refresh: a studio page loads itself again, once, shortly after work it shows has ended.
// While the studio is gone the page shows its paused view, and loads itself again when it is back.

import { needsRefresh } from './job-events.ts';
import { watchPause } from './paused.ts';
import { readEvents, type StreamHealth } from './sse.ts';

const EVENTS_URL = '/api/v1/events';
/** Jobs often end close together; one reload, this long after the last of them, covers them. */
const RELOAD_DELAY_MS = 300;

/**
 * The paused view of this page (`src/studio/pages/paused.ts`), worked by the stream's health. The
 * page's other parts are hidden by the skin while `data-paused` is on the body. A page without the
 * view gets no watch.
 */
export function watchStudio(stream: AbortController): StreamHealth | undefined {
  const view = document.querySelector('[data-paused-view]');
  if (!(view instanceof HTMLElement)) return undefined;
  return watchPause(
    {
      show: () => {
        document.body.dataset.paused = '';
        view.hidden = false;
        // What had focus is hidden now; the view takes it, so a keyboard is not left nowhere.
        view.focus();
      },
      reload: () => {
        // Closing the stream first: no event of the new studio starts a second reload.
        stream.abort();
        location.reload();
      },
    },
    {
      after: (ms, fn) => {
        const timer = setTimeout(fn, ms);
        return () => clearTimeout(timer);
      },
    },
  );
}

/** Listens to the studio's events; `shows` says whether the page shows a draft. */
export function reloadWhenJobsEnd(shows: (slug: string) => boolean): void {
  const stream = new AbortController();
  /** Counts the calls; only the timer of the last one reloads. */
  let calls = 0;
  const reloadSoon = (): void => {
    calls += 1;
    const call = calls;
    setTimeout(() => {
      if (call !== calls) return;
      // Closing the stream first: nothing more arrives, so the page reloads only once.
      stream.abort();
      location.reload();
    }, RELOAD_DELAY_MS);
  };
  readEvents(
    EVENTS_URL,
    (event) => {
      if (needsRefresh(event, shows)) reloadSoon();
    },
    stream.signal,
    watchStudio(stream),
  );
}
