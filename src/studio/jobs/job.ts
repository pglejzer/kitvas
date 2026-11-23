// A job: a long operation the studio runs for a draft or a kit, reported by its state.

import { type Zod, z } from '../../shared/index.ts';

export const JobErrorSchema = z.strictObject({ code: z.string(), message: z.string() });

export const JobSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['build', 'check', 'catalog']),
  /** The draft's slug; for a `catalog` job the id of the kit whose examples it builds. */
  slug: z.string(),
  state: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  /** What the CLI command answered, once it succeeded. */
  result: z.unknown(),
  error: JobErrorSchema.nullable(),
});

export type Job = Zod.infer<typeof JobSchema>;
export type JobError = Zod.infer<typeof JobErrorSchema>;
export type JobKind = Job['kind'];

/** How a job ended. */
export type JobOutcome =
  | { state: 'succeeded'; result: unknown }
  | { state: 'failed'; error: JobError }
  | { state: 'cancelled' };

/** A started job: it ends by itself or when cancelled. `done` never rejects. */
export type RunningJob = { done: Promise<JobOutcome>; cancel(): void };

/** Starts the CLI with these arguments; the runner adds `--json`. */
export type JobRunner = (args: string[]) => RunningJob;
