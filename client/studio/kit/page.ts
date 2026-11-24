// The kit page's script: the example frames take the height they report, and the kit's examples
// are built as a catalog job, with one reload when that gives new ones. The page works without it.

import { watchStudio } from '../live/live.ts';
import { readEvents } from '../live/sse.ts';
import {
  type CatalogStep,
  type CatalogWatch,
  catalogStep,
  postStep,
  startedJob,
} from './catalog.ts';
import { applyReport, exampleReport, findExampleFrames } from './frames.ts';

const EVENTS_URL = '/api/v1/events';
/** Set right before the page reloads itself; the page that loads next reads and removes it. */
const RELOAD_MARK = 'kitvas.kit.reloaded';

function listenToFrames(main: HTMLElement): void {
  const frames = findExampleFrames(main);
  if (frames.length === 0) return;
  window.addEventListener('message', (event) => {
    const report = exampleReport(frames, event);
    if (report) applyReport(main, report);
  });
}

/** Whether this page was loaded by its own reload for `kit`. Storage may be refused: then not. */
function takeReloadMark(kit: string): boolean {
  try {
    const mark = sessionStorage.getItem(RELOAD_MARK);
    sessionStorage.removeItem(RELOAD_MARK);
    return mark === kit;
  } catch {
    return false;
  }
}

function setReloadMark(kit: string): void {
  try {
    sessionStorage.setItem(RELOAD_MARK, kit);
  } catch {
    // Without storage the next page cannot tell it was reloaded; the reload still happens.
  }
}

/** The building note goes away and the failed note shows. */
function showFailed(main: HTMLElement): void {
  for (const note of main.querySelectorAll<HTMLElement>('[data-catalog-note]')) {
    note.hidden = note.dataset.catalogNote !== 'failed';
  }
}

/** Starts the catalog job of `kit`; a network error answers as status 0. */
async function askForCatalog(kit: string): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(`/api/v1/kits/${encodeURIComponent(kit)}/catalog`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const body: unknown = await response.json().catch(() => undefined);
    return { status: response.status, body };
  } catch {
    return { status: 0, body: undefined };
  }
}

function watchCatalog(main: HTMLElement, kit: string): void {
  const watch: CatalogWatch = {
    kit,
    catalog: main.dataset.catalog === 'ready' ? 'ready' : 'missing',
    job: undefined,
    reloaded: takeReloadMark(kit),
  };
  const stream = new AbortController();
  let over = false;
  const end = (step: CatalogStep): void => {
    if (over) return;
    over = true;
    if (step === 'failed') showFailed(main);
    // Only a reload for new examples is marked; one after lost events cannot repeat by itself.
    if (step === 'reload') setReloadMark(kit);
    if (step === 'reload' || step === 'missed') {
      // Closing the stream first: nothing more arrives, so the page reloads only once.
      stream.abort();
      location.reload();
    }
    // Otherwise the stream stays open, its events unheard, so the paused view still shows when
    // the studio goes away.
  };
  // The stream is asked for before the job, so the job cannot end between the studio's answer and
  // the stream opening; until the answer names the job, any catalog job of this kit counts.
  readEvents(
    EVENTS_URL,
    (event) => {
      if (over) return;
      const step = catalogStep(watch, event);
      if (step) end(step);
    },
    stream.signal,
    watchStudio(stream),
  );
  askForCatalog(kit).then(({ status, body }) => {
    if (over) return;
    const step = postStep(status, watch.catalog);
    if (step === 'wait') watch.job = startedJob(status, body);
    else end(step);
  });
}

export function startKitPage(main: HTMLElement): void {
  listenToFrames(main);
  const kit = main.dataset.kit;
  if (kit) watchCatalog(main, kit);
}
