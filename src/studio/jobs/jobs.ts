// The studio's jobs: one running job per draft, every change published, old ones dropped.

import { randomUUID } from 'node:crypto';
import { KitvasError, type Translate } from '../../shared/index.ts';
import type { Job, JobKind, JobOutcome, JobRunner, RunningJob } from './job.ts';

/** Finished jobs kept for the API; older ones are dropped. */
export const KEEP_JOBS = 50;

export type JobsDeps = {
  run: JobRunner;
  /** Every new job and every change of one. */
  publish(job: Job): void;
  now(): Date;
  t: Translate;
  keep?: number;
};

export type Jobs = {
  /**
   * Runs `kitvas <kind> <slug>`, or `kitvas kit build <id>` for a catalog job whose `slug` is the
   * kit id. Refused while any job of the same target runs; drafts and kits are separate targets.
   */
  start(kind: JobKind, slug: string): Job;
  get(id: string): Job;
  /** Newest first. */
  list(): Job[];
  /** Asks a running job to stop; a finished one stays as it is. */
  cancel(id: string): Job;
  /** Stops every running job and waits for it to end. */
  close(): Promise<void>;
};

export function createJobs(deps: JobsDeps): Jobs {
  const keep = deps.keep ?? KEEP_JOBS;
  const jobs = new Map<string, Job>();
  const running = new Map<string, RunningJob>();

  const save = (job: Job): Job => {
    jobs.set(job.id, job);
    deps.publish(job);
    return job;
  };

  const prune = (): void => {
    const finished = [...jobs.values()].filter((job) => job.state !== 'running');
    for (const job of finished.slice(0, Math.max(0, finished.length - keep))) jobs.delete(job.id);
  };

  const finish = (job: Job, outcome: JobOutcome): void => {
    running.delete(job.id);
    const finishedAt = deps.now().toISOString();
    if (outcome.state === 'succeeded') {
      save({ ...job, state: 'succeeded', finishedAt, result: outcome.result });
    } else if (outcome.state === 'failed') {
      save({ ...job, state: 'failed', finishedAt, error: outcome.error });
    } else {
      save({ ...job, state: 'cancelled', finishedAt });
    }
    prune();
  };

  const find = (id: string): Job => {
    const job = jobs.get(id);
    if (!job) throw new KitvasError('JOB_NOT_FOUND', { id });
    return job;
  };

  return {
    start(kind, slug) {
      // A draft named `base` and the kit `base` are two targets and do not block each other.
      const busy = [...jobs.values()].find(
        (job) =>
          job.slug === slug &&
          job.state === 'running' &&
          (job.kind === 'catalog') === (kind === 'catalog'),
      );
      if (busy) throw new KitvasError('JOB_RUNNING', { slug, job: busy.id });
      // The process starts first: if it cannot, no job is left behind as running.
      const handle = deps.run(kind === 'catalog' ? ['kit', 'build', slug] : [kind, slug]);
      const job = save({
        id: randomUUID(),
        kind,
        slug,
        state: 'running',
        createdAt: deps.now().toISOString(),
        finishedAt: null,
        result: null,
        error: null,
      });
      running.set(job.id, handle);
      handle.done.then(
        (outcome) => finish(job, outcome),
        (error: unknown) =>
          finish(job, {
            state: 'failed',
            error: {
              code: 'INTERNAL',
              message: deps.t('error.INTERNAL', { detail: String(error) }),
            },
          }),
      );
      return job;
    },
    get: find,
    list: () => [...jobs.values()].reverse(),
    cancel(id) {
      const job = find(id);
      running.get(id)?.cancel();
      return job;
    },
    async close() {
      const handles = [...running.values()];
      for (const handle of handles) handle.cancel();
      await Promise.all(handles.map((handle) => handle.done.catch(() => undefined)));
    },
  };
}
