// The CLI's side of deleting a draft (ADR 0064): when a studio runs for the project, `kitvas draft
// delete | restore | purge` asks it to make the change through its API, so the studio can tell its
// open pages (the `drafts` event). With no studio the caller makes the change on the files itself.

import { KitvasError, z } from '../../../shared/index.ts';
import { type LifecycleDeps, runningState } from '../../run/lifecycle.ts';
import type { StudioState } from '../../run/state-file.ts';
import { callStudio, type StudioAnswer, type StudioCall } from '../../run/studio-client.ts';
import {
  type DeletedItem,
  DraftDeletedSchema,
  DraftPurgedSchema,
  DraftRestoredSchema,
} from './trash-schemas.ts';

/** One call to a running studio; tests pass their own. */
export type TrashCaller = (state: StudioState, call: StudioCall) => Promise<StudioAnswer>;

export type TrashClientDeps = {
  lifecycle: LifecycleDeps;
  /** `callStudio` when absent. */
  call?: TrashCaller | undefined;
};

/** A delete moves a folder after the draft's jobs stopped: more time than a read. */
const CALL_TIMEOUT_MS = 20_000;

const ProblemSchema = z.object({ code: z.string(), detail: z.string().optional() });

/** The refusals about the draft itself, which the files would have thrown in the same words. */
const OWN_CODES = ['DRAFT_NOT_FOUND', 'DRAFT_NOT_DELETED', 'DRAFT_EXISTS'] as const;
const isOwnCode = (code: string): code is (typeof OWN_CODES)[number] =>
  (OWN_CODES as readonly string[]).includes(code);

/**
 * A refusal of the studio. One about the draft is the error the files would have thrown, so the
 * output is the same. Any other is told in the studio's words: its text may need a field this
 * side cannot fill.
 */
function refusal(answer: StudioAnswer, slug: string): KitvasError {
  const problem = ProblemSchema.safeParse(answer.body);
  if (!problem.success) {
    return new KitvasError('INTERNAL', { detail: `the studio answered ${answer.status}` });
  }
  const { code, detail } = problem.data;
  if (isOwnCode(code)) return new KitvasError(code, { slug });
  const words = detail === undefined ? '' : `: ${detail}`;
  return new KitvasError('INTERNAL', {
    detail: `the studio answered ${answer.status} ${code}${words}`,
  });
}

/** `undefined` when no studio runs for the project: the caller does the work itself. */
async function viaStudio<T>(
  deps: TrashClientDeps,
  call: StudioCall,
  slug: string,
  schema: { safeParse(raw: unknown): { success: true; data: T } | { success: false } },
): Promise<T | undefined> {
  const state = await runningState(deps.lifecycle);
  if (!state) return undefined;
  const answer = await (deps.call ?? callStudio)(state, call);
  if (answer.status < 200 || answer.status >= 300) throw refusal(answer, slug);
  const parsed = schema.safeParse(answer.body);
  if (!parsed.success) {
    throw new KitvasError('INTERNAL', { detail: `the studio answered ${call.path} oddly` });
  }
  return parsed.data;
}

/** `DELETE /api/v1/drafts/{slug}`. */
export async function deleteViaStudio(
  deps: TrashClientDeps,
  slug: string,
): Promise<DeletedItem | undefined> {
  const done = await viaStudio(
    deps,
    { method: 'DELETE', path: `/api/v1/drafts/${slug}`, body: {}, timeoutMs: CALL_TIMEOUT_MS },
    slug,
    DraftDeletedSchema,
  );
  return done?.deleted;
}

/** `POST /api/v1/trash/{slug}/restore`. */
export async function restoreViaStudio(
  deps: TrashClientDeps,
  slug: string,
): Promise<DeletedItem | undefined> {
  const done = await viaStudio(
    deps,
    { method: 'POST', path: `/api/v1/trash/${slug}/restore`, body: {}, timeoutMs: CALL_TIMEOUT_MS },
    slug,
    DraftRestoredSchema,
  );
  return done?.restored;
}

/** `DELETE /api/v1/trash/{slug}`. */
export async function purgeViaStudio(
  deps: TrashClientDeps,
  slug: string,
): Promise<DeletedItem[] | undefined> {
  const done = await viaStudio(
    deps,
    { method: 'DELETE', path: `/api/v1/trash/${slug}`, body: {}, timeoutMs: CALL_TIMEOUT_MS },
    slug,
    DraftPurgedSchema,
  );
  return done?.purged;
}
