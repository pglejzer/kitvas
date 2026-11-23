// Live refresh: a studio page loads itself again, once, shortly after work it shows has ended.

import { needsRefresh } from './job-events.ts';
import { readEvents } from './sse.ts';

const EVENTS_URL = '/api/v1/events';
/** Jobs often end close together; one reload, this long after the last of them, covers them. */
const RELOAD_DELAY_MS = 300;

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
  );
}
