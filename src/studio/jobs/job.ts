// A job: a long operation the studio runs for a draft or a kit, reported by its state.

import { type Zod, z } from '../../shared/index.ts';

export const JobErrorSchema = z.strictObject({ code: z.string(), message: z.string() });

export const JobSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['build', 'check', 'catalog', 'previews']),
  /**
   * The draft's slug; for a `catalog` job the id of the kit whose examples it builds, for a
   * `previews` job the id of the kit whose Insert pane previews it makes (ADR 0075).
   */
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

/** What a job of a kind is run on: a draft, a kit's examples, or a kit's previews. */
export type JobTarget = 'draft' | 'catalog' | 'previews';

export const jobTarget = (kind: JobKind): JobTarget =>
  kind === 'catalog' || kind === 'previews' ? kind : 'draft';

/** The CLI arguments of a job; the runner adds `--json`. */
export function jobArgs(kind: JobKind, slug: string): string[] {
  if (kind === 'catalog') return ['kit', 'build', slug];
  if (kind === 'previews') return ['kit', 'previews', slug];
  return [kind, slug];
}

/** How a job ended. */
export type JobOutcome =
  | { state: 'succeeded'; result: unknown }
  | { state: 'failed'; error: JobError }
  | { state: 'cancelled' };

/** A started job: it ends by itself or when cancelled. `done` never rejects. */
export type RunningJob = { done: Promise<JobOutcome>; cancel(): void };

/** Starts the CLI with these arguments; the runner adds `--json`. */
export type JobRunner = (args: string[]) => RunningJob;
