// Smart validation (spec 4c, goal 5; plan 16, task C): during a session only the live checks run.
// "Save version" (`session.ts`) asks for the full check, every state and width, as a job
// (`POST /api/v1/drafts/{slug}/checks`); when that job ends, the Checks pane is read from the
// server's page again and swapped in, as a state switch swaps its sections, without a reload.
// The decisions are in `createFullCheck` over injected ports; the DOM parts are at the end.

import { jobOf } from '../../live/job-events.ts';
import type { StreamEvent } from '../../live/sse.ts';

/** `session.ts` dispatches it on `main` after a save that ended the session. */
export const FULL_CHECK_EVENT = 'kitvas:full-check';
/**
 * Dispatched on `main` once fresh findings are in the Checks pane: the draft page marks them on
 * the canvas again, and the waivers put their controls on the new rows.
 */
export const CHECKS_SWAPPED_EVENT = 'kitvas:checks-swapped';

export type FullCheckStatus = 'idle' | 'running' | 'done' | 'failed';

/** How a check job of `slug` ended; `null` for any other event. `job: null` takes any check job. */
export function fullCheckEnd(
  event: StreamEvent,
  slug: string,
  job: string | null,
): 'succeeded' | 'failed' | null {
  const data = jobOf(event);
  if (data?.kind !== 'check' || data.slug !== slug) return null;
  if (job !== null && data.id !== job) return null;
  if (data.state === 'succeeded') return 'succeeded';
  return data.state === 'failed' || data.state === 'cancelled' ? 'failed' : null;
}

export type FullCheckIo = {
  /** Starts the job: its id, or why not (409: one runs already, and its end is awaited). */
  post(slug: string): Promise<{ ok: true; job: string | null } | { ok: false; status: number }>;
  /** Puts the server's Checks pane in place of this page's; `false` when it could not. */
  swap(): Promise<boolean>;
};

export type FullCheck = {
  start(): Promise<void>;
  /** Every event of the page's stream. */
  hear(event: StreamEvent): void;
  status(): FullCheckStatus;
};

export function createFullCheck(
  slug: string,
  io: FullCheckIo,
  changed: (status: FullCheckStatus) => void,
): FullCheck {
  let status: FullCheckStatus = 'idle';
  /** The job started; `null` while its id is not known, or when another one was already running. */
  let job: string | null = null;
  let starts = 0;
  /** The pane is being read again: a second event of the same end changes nothing. */
  let ending = false;

  const set = (next: FullCheckStatus): void => {
    status = next;
    changed(next);
  };

  return {
    async start() {
      starts += 1;
      const mine = starts;
      job = null;
      ending = false;
      set('running');
      const answer = await io.post(slug);
      if (mine !== starts) return;
      if (answer.ok) job = answer.job;
      else if (answer.status !== 409) set('failed');
    },
    hear(event) {
      if (status !== 'running' || ending) return;
      const end = fullCheckEnd(event, slug, job);
      if (end === null) return;
      ending = true;
      const mine = starts;
      void io.swap().then((swapped) => {
        if (mine !== starts) return;
        ending = false;
        set(end === 'succeeded' && swapped ? 'done' : 'failed');
      });
    },
    status: () => status,
  };
}

// The page's side.

/** Asks for the full check: `session.ts` calls it once "Save version" ended the session. */
export function requestFullCheck(main: HTMLElement): void {
  main.dispatchEvent(new CustomEvent(FULL_CHECK_EVENT));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function postCheck(
  slug: string,
): Promise<{ ok: true; job: string | null } | { ok: false; status: number }> {
  try {
    const response = await fetch(`/api/v1/drafts/${encodeURIComponent(slug)}/checks`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) return { ok: false, status: response.status };
    const body: unknown = await response.json().catch(() => undefined);
    const id = isRecord(body) && typeof body.id === 'string' ? body.id : null;
    return { ok: true, job: id };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * The server's page for this address as inert markup (a template's content runs nothing), its
 * Checks pane's content in place of this page's. The pane itself stays, with what the screen put
 * on it; a page of another draft changes nothing.
 */
export async function swapChecks(main: HTMLElement): Promise<boolean> {
  try {
    const response = await fetch(location.href, {
      credentials: 'same-origin',
      headers: { accept: 'text/html' },
    });
    if (!response.ok) return false;
    const template = document.createElement('template');
    template.innerHTML = await response.text();
    const next = template.content.querySelector<HTMLElement>('main.draft-page');
    const fresh = next?.dataset.draft === main.dataset.draft ? next : null;
    const now = fresh?.querySelector('[data-shell="checks"]');
    const old = main.querySelector('[data-shell="checks"]');
    if (!now || !old) return false;
    old.replaceChildren(...document.importNode(now, true).childNodes);
    main.dispatchEvent(new CustomEvent(CHECKS_SWAPPED_EVENT));
    return true;
  } catch {
    return false;
  }
}
