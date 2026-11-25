// Live refresh: a studio page loads itself again, once, shortly after work it shows has ended:
// a job, or the studio's own build of a draft. While the person edits, the page never does; the
// editor loads only its frame again (`edit/live-frame.ts`), which hears the same stream through
// `onStudioEvent`. While the studio is gone the page shows its paused view, and loads itself
// again when it is back.
//
// A page has one events stream (`openStudioStream`), opened by the first part that needs it: the
// reload, the kit page's catalog, or the bar's status (`client/studio/shell/bar-status.ts`). Its
// events reach every `onStudioEvent` listener and its health every `onStudioHealth` listener.

import { needsReload } from './job-events.ts';
import { watchPause } from './paused.ts';
import { readEvents, type StreamEvent, type StreamHealth } from './sse.ts';

const EVENTS_URL = '/api/v1/events';
/** Jobs often end close together; one reload, this long after the last of them, covers them. */
const RELOAD_DELAY_MS = 300;

/** Other parts of the page that hear the stream: one stream per tab, never a second one. */
const listeners = new Set<(event: StreamEvent) => void>();
/** Parts of the page that hear when the stream opened and when it was lost. */
const healths = new Set<StreamHealth>();
/** The page's one stream, once a part opened it. */
let pageStream: AbortController | undefined;

/** Hears every event of the page's stream from now on; returns the way to stop. */
export function onStudioEvent(listener: (event: StreamEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hears each open and each loss of the page's stream from now on; returns the way to stop. */
export function onStudioHealth(listener: StreamHealth): () => void {
  healths.add(listener);
  return () => healths.delete(listener);
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

/** One part's bug is reported; the others still hear that the stream opened or was lost. */
function tellHealth(heard: (health: StreamHealth) => void): void {
  for (const health of [...healths]) {
    try {
      heard(health);
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
 * The page's events stream, opened now unless a part of the page opened it already; it works the
 * paused view too. Abort the controller it returns only right before the page loads itself again.
 */
export function openStudioStream(): AbortController {
  if (pageStream) return pageStream;
  const stream = new AbortController();
  pageStream = stream;
  const pause = watchStudio(stream);
  readEvents(EVENTS_URL, tell, stream.signal, {
    opened: () => {
      pause?.opened();
      tellHealth((health) => health.opened());
    },
    lost: () => {
      pause?.lost();
      tellHealth((health) => health.lost());
    },
  });
  return stream;
}

/**
 * Listens to the studio's events; `shows` says whether the page shows a draft, `editing` whether
 * the person is editing on it now (then the page stays as it is).
 */
export function reloadWhenJobsEnd(
  shows: (slug: string) => boolean,
  editing: () => boolean = () => false,
): void {
  const stream = openStudioStream();
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
  onStudioEvent((event) => {
    if (needsReload(event, shows, editing())) reloadSoon();
  });
}
