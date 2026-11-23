// Use cases of the editor's session (spec 4a, decision 2; ADR 0049): the first edit starts the
// next version, later edits go into it, and "Save version" ends it. Anyone who starts a newer
// version ends it too, so a session is open only while its version is the latest.

import { type Draft, latestVersion, serializeJson } from '../domain/draft.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { loadDraft } from './load-draft.ts';
import { addVersion } from './new-version.ts';

export type EditSession = { version: number; startedAt: string };

/** The open session; `null` when there is none or a newer version has ended it. */
export function editSession(draft: Draft): EditSession | null {
  const edit = draft.edit;
  if (edit === undefined || edit.version !== latestVersion(draft)) return null;
  return { version: edit.version, startedAt: edit.startedAt };
}

/** Starts the next version and opens the session in it. Returns the new version's number. */
export function startEditSession(store: DraftStore, slug: string, now: Date): number {
  const { version } = addVersion(store, slug, now);
  const draft = loadDraft(store, slug);
  const edit = { version, startedAt: now.toISOString() };
  store.writeText(slug, 'draft.json', serializeJson({ ...draft, edit }));
  return version;
}

/**
 * "Save version": the next edit starts a new version. `ended` says whether a session was open. A
 * session that a newer version already ended is cleared as well; a draft with neither is not
 * rewritten.
 */
export function endEditSession(
  store: DraftStore,
  slug: string,
): { version: number; ended: boolean } {
  const draft = loadDraft(store, slug);
  const ended = editSession(draft) !== null;
  const { edit, ...rest } = draft;
  if (edit !== undefined) store.writeText(slug, 'draft.json', serializeJson(rest));
  return { version: latestVersion(draft), ended };
}
