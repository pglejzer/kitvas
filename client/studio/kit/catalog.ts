// What the kit page does about its rendered examples (shared contract 9): on load it asks the
// studio to build them as a catalog job, then waits for that job to end. A build with new output
// loads the page again, once, so its frames show it; a failed one shows a note. These are the
// decisions only; `kit-page.ts` does the requests and changes the page.

import { jobOf } from '../live/job-events.ts';
import type { StreamEvent } from '../live/sse.ts';

/** `data-catalog` of the page: `ready` when a build's stamp existed as the page was made. */
export type CatalogState = 'ready' | 'missing';

export type CatalogWatch = {
  kit: string;
  catalog: CatalogState;
  /** The job the page started; `undefined` until the studio answers, or while another runs. */
  job: string | undefined;
  /** This page was loaded by a reload of its own, which is not repeated. */
  reloaded: boolean;
};

/**
 * `reload`: the page loads again to show new examples. `failed`: the failed note shows. `done`:
 * nothing changes. `missed`: the stream lost events, so the page loads again to start over.
 */
export type CatalogStep = 'reload' | 'failed' | 'done' | 'missed';

/** After the request that starts the job: `wait` for its end, or stop now. */
export type PostStep = 'wait' | 'failed' | 'done';

/** The statuses that mean a catalog job of this kit runs: just started, or already running. */
const STARTED = 202;
const RUNNING = 409;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Nothing new to show: without examples the page says they could not be built, else it stays. */
const noNews = (catalog: CatalogState): 'failed' | 'done' =>
  catalog === 'missing' ? 'failed' : 'done';

/** What the answer to the request that starts the job means. A network error is status 0. */
export function postStep(status: number, catalog: CatalogState): PostStep {
  return status === STARTED || status === RUNNING ? 'wait' : noNews(catalog);
}

/** The id of the job a 202 answer started; `undefined` for any other answer. */
export function startedJob(status: number, body: unknown): string | undefined {
  if (status !== STARTED || !isObject(body)) return undefined;
  return typeof body.id === 'string' && body.id !== '' ? body.id : undefined;
}

/**
 * What an event means for the watch; `undefined` when it is not about the watched job or the job
 * still runs. The job is matched by its id once known, before that by kind and kit, so a job that
 * ends before the studio's answer (or one another tab started) still counts.
 */
export function catalogStep(watch: CatalogWatch, event: StreamEvent): CatalogStep | undefined {
  if (event.event === 'reset') return 'missed';
  const job = jobOf(event);
  if (job?.kind !== 'catalog' || job.slug !== watch.kit) return undefined;
  if (watch.job !== undefined && job.id !== watch.job) return undefined;
  if (job.state === 'failed') return 'failed';
  // Stopped before it ended: the build did not happen.
  if (job.state === 'cancelled') return noNews(watch.catalog);
  if (job.state !== 'succeeded') return undefined;
  const { result } = job;
  if (!isObject(result) || result.built !== true) return 'failed';
  const fresh = result.cached === false || watch.catalog === 'missing';
  if (!fresh) return 'done';
  // A page its own reload loaded and that still needs one would reload forever: stop here.
  return watch.reloaded ? noNews(watch.catalog) : 'reload';
}
