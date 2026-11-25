// The previews of each kit for the editor's Insert pane (ADR 0075), as the palette route asks for
// them: what is on disk is answered at once, and previews that are missing or stale start ONE
// `previews` job per kit. Without a browser nothing is started again while the studio runs; a job
// that fails is logged and not started again until the kit changes (its catalog key).

import type { PreviewsOnDisk, PreviewsStamp } from '../../checks/index.ts';
import { KitvasError } from '../../shared/index.ts';
import type { Job } from '../jobs/job.ts';
import type { Jobs } from '../jobs/jobs.ts';

/** The previews on disk of one kit, from `src/main.ts` (`readPreviews` of the checks module). */
export type PreviewsPort = { read(kitId: string): PreviewsOnDisk };

export type KeeperDeps = {
  previews: PreviewsPort;
  jobs: Pick<Jobs, 'start' | 'get'>;
  /** The studio's error log: a job that failed, a read that broke. */
  onError?: ((error: unknown) => void) | undefined;
};

/**
 * `ready`: made for the kit as it is now. `making`: a job is making them; `stamp` is the previous
 * set, if any. `none`: none can be made (no browser, the kit or its catalog failed).
 */
export type KitPreviews =
  | { state: 'ready'; stamp: PreviewsStamp }
  | { state: 'making'; stamp: PreviewsStamp | undefined }
  | { state: 'none' };

export type PreviewsKeeper = { view(kitId: string): KitPreviews };

/** The job a keeper started for a kit, and the catalog key the kit had then. */
type Started = { job: string; key: string };

const NONE: KitPreviews = { state: 'none' };

export function createPreviewsKeeper(deps: KeeperDeps): PreviewsKeeper {
  const started = new Map<string, Started>();
  /** The catalog key a kit's job failed at: nothing starts again until the key changes. */
  const failed = new Map<string, string>();
  /** Set once a job found no browser: for the rest of this studio run no job starts. */
  let noBrowser = false;

  const log = (kitId: string, text: string): void =>
    deps.onError?.(new Error(`kitvas kit previews ${kitId}: ${text}`));

  /** The job a kit's previews are made by, or `undefined` once it has ended (then it is settled). */
  const running = (kitId: string, disk: PreviewsOnDisk): Started | undefined => {
    const entry = started.get(kitId);
    if (entry === undefined) return undefined;
    let job: Job | undefined;
    try {
      job = deps.jobs.get(entry.job);
    } catch {
      // Dropped from the list: it ended long ago, how is not known.
      job = undefined;
    }
    if (job?.state === 'running') return entry;
    started.delete(kitId);
    if (job?.state === 'failed' && job.error !== null) {
      if (job.error.code === 'BROWSER_MISSING') noBrowser = true;
      else {
        failed.set(kitId, entry.key);
        log(kitId, `${job.error.code}: ${job.error.message}`);
      }
    } else if (job?.state === 'succeeded' && !disk.fresh && disk.key === entry.key) {
      // Made for this key, yet still not current on disk: making them again would loop.
      failed.set(kitId, entry.key);
      log(kitId, 'the previews it made do not match the kit');
    }
    return undefined;
  };

  const start = (kitId: string, disk: PreviewsOnDisk, key: string): KitPreviews => {
    const making: KitPreviews = { state: 'making', stamp: disk.stamp };
    try {
      started.set(kitId, { job: deps.jobs.start('previews', kitId).id, key });
      return making;
    } catch (error) {
      // Started by another way in: wait for that one.
      if (error instanceof KitvasError && error.code === 'JOB_RUNNING') {
        const job = error.params.job;
        if (typeof job === 'string') started.set(kitId, { job, key });
        return making;
      }
      failed.set(kitId, key);
      log(kitId, error instanceof Error ? error.message : String(error));
      return NONE;
    }
  };

  return {
    view(kitId) {
      let disk: PreviewsOnDisk;
      try {
        disk = deps.previews.read(kitId);
      } catch (error) {
        // The palette still answers; the log has the cause.
        deps.onError?.(error);
        return NONE;
      }
      const job = running(kitId, disk);
      if (disk.fresh && disk.stamp !== undefined) return { state: 'ready', stamp: disk.stamp };
      if (job !== undefined) return { state: 'making', stamp: disk.stamp };
      const { key } = disk;
      if (noBrowser || key === undefined || failed.get(kitId) === key) return NONE;
      return start(kitId, disk, key);
    },
  };
}
