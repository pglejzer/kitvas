// Live refresh: a studio page loads itself again, once, shortly after work it shows has ended:
// a job, or the studio's own build of a draft. While the person edits, the page never does; the
// editor loads only its frame again (`edit/live-frame.ts`), which hears the same stream through
// `onStudioEvent`. While the studio is gone the page shows its paused view, and loads itself
// again when it is back.

import { needsReload } from './job-events.ts';
import { watchPause } from './paused.ts';
import { readEvents, type StreamEvent, type StreamHealth } from './sse.ts';

const EVENTS_URL = '/api/v1/events';
/** Jobs often end close together; one reload, this long after the last of them, covers them. */
const RELOAD_DELAY_MS = 300;

/** Other parts of the page that hear the stream: one stream per tab, never a second one. */
const listeners = new Set<(event: StreamEvent) => void>();

/** Hears every event of the page's stream from now on; returns the way to stop. */
export function onStudioEvent(listener: (event: StreamEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One listener's bug is reported; the others still hear the event. */
function tell(event: StreamEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (error) {
      reportError(error);
    }
  }
}

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

/**
 * Listens to the studio's events; `shows` says whether the page shows a draft, `editing` whether
 * the person is editing on it now (then the page stays as it is).
 */
export function reloadWhenJobsEnd(
  shows: (slug: string) => boolean,
  editing: () => boolean = () => false,
): void {
  const stream = new AbortController();
  /** Counts the calls; only the timer of the last one reloads. */
  let calls = 0;
  const reloadSoon = (): void => {
    calls += 1;
    const call = calls;
    setTimeout(() => {
      // Edit mode may have been turned on meanwhile: then the editor carries on instead.
      if (call !== calls || editing()) return;
      // Closing the stream first: nothing more arrives, so the page reloads only once.
      stream.abort();
      location.reload();
    }, RELOAD_DELAY_MS);
  };
  readEvents(
    EVENTS_URL,
    (event) => {
      tell(event);
      if (needsReload(event, shows, editing())) reloadSoon();
    },
    stream.signal,
    watchStudio(stream),
  );
}
