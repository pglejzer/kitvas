// The trash steps of `kitvas draft` (ADR 0064): delete, restore and purge. With a studio running
// for the project the change goes through its API, so its open pages hear a `drafts` event; with
// none it is made on the files. The answer is the same either way.

import { realpathSync } from 'node:fs';
import {
  type DeletedDraft,
  type DraftStore,
  deleteDraft,
  isSlug,
  listDeleted,
  purgeAllDeleted,
  purgeDeleted,
  requireDeleted,
  restoreDraft,
  trashEntryName,
} from '../../drafts/index.ts';
import {
  deleteViaStudio,
  type LifecycleDeps,
  purgeViaStudio,
  restoreViaStudio,
  type TrashCaller,
  type TrashClientDeps,
} from '../../studio/index.ts';

/** How the CLI reaches a running studio; absent in a program that has none to reach. */
export type TrashStudio = {
  /** The lifecycle of the studio of `project`, a real path. */
  lifecycle(project: string): LifecycleDeps;
  /** How the studio is called; the real one when absent. */
  call?: TrashCaller | undefined;
};

/** The client for the studio of the project in `cwd`; `undefined` where none can be reached. */
function clientOf(studio: TrashStudio | undefined, cwd: string): TrashClientDeps | undefined {
  if (!studio) return undefined;
  return { lifecycle: studio.lifecycle(realpathSync.native(cwd)), call: studio.call };
}

/** Moves the draft to the trash: through the studio when one runs, else on the files. */
export async function deleteIn(
  studio: TrashStudio | undefined,
  cwd: string,
  drafts: DraftStore,
  slug: string,
): Promise<DeletedDraft> {
  const client = clientOf(studio, cwd);
  // A name that is not a slug is refused by the files' own rule, with its own message.
  if (client && isSlug(slug)) {
    const done = await deleteViaStudio(client, slug);
    if (done) {
      const entry = trashEntryName(done.slug, new Date(done.deletedAt));
      return { slug: done.slug, title: done.title, deletedAt: done.deletedAt, entry };
    }
  }
  return deleteDraft(drafts, slug, new Date());
}

/** Brings the newest deleted copy back. DRAFT_NOT_DELETED when the trash holds none. */
export async function restoreIn(
  studio: TrashStudio | undefined,
  cwd: string,
  drafts: DraftStore,
  slug: string,
): Promise<DeletedDraft> {
  const [newest] = requireDeleted(drafts, slug);
  const client = clientOf(studio, cwd);
  if (client && newest && (await restoreViaStudio(client, slug)) !== undefined) return newest;
  return restoreDraft(drafts, slug);
}

/** Removes the deleted copies of one slug for good. DRAFT_NOT_DELETED when the trash holds none. */
export async function purgeIn(
  studio: TrashStudio | undefined,
  cwd: string,
  drafts: DraftStore,
  slug: string,
): Promise<DeletedDraft[]> {
  const copies = requireDeleted(drafts, slug);
  const client = clientOf(studio, cwd);
  if (client && (await purgeViaStudio(client, slug)) !== undefined) return copies;
  return purgeDeleted(drafts, slug);
}

/** Removes every deleted draft for good, one slug at a time through the studio when one runs. */
export async function purgeAllIn(
  studio: TrashStudio | undefined,
  cwd: string,
  drafts: DraftStore,
): Promise<DeletedDraft[]> {
  const copies = listDeleted(drafts);
  const client = clientOf(studio, cwd);
  if (!client || copies.length === 0) return purgeAllDeleted(drafts);
  const slugs = [...new Set(copies.map((copy) => copy.slug))];
  for (const [index, slug] of slugs.entries()) {
    const done = await purgeViaStudio(client, slug);
    // No studio answered the first call: the files do all of it.
    if (done === undefined && index === 0) return purgeAllDeleted(drafts);
  }
  return copies;
}
