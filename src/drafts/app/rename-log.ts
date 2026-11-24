// The rename log of a version (spec 4b, decision 7; plan 14, task B2): every applied request's old
// id → new id map and the ids it created, in order. Kept in `v<n>/edit/renames.json`, beside the
// version's sources; the build never reads it. Reset (decision 15) and 4d's timeline follow it back.

import { z } from '../../shared/index.ts';
import { serializeJson } from '../domain/draft.ts';
import { versionFolder } from '../domain/names.ts';
import type { DraftStore } from '../ports/draft-store.ts';

export const RENAMES_FILE = 'edit/renames.json';

export type RenameStep = { at: string; renames: Record<string, string>; created: string[] };
export type RenameLog = { schemaVersion: 1; steps: RenameStep[] };

const RenameLogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  steps: z.array(
    z.strictObject({
      at: z.string(),
      renames: z.record(z.string(), z.string()),
      created: z.array(z.string()),
    }),
  ),
});

const logPath = (version: number): string => `${versionFolder(version)}/${RENAMES_FILE}`;

/** Appends one step to the version's log, creating the file on the first step. */
export function appendRenames(
  store: DraftStore,
  slug: string,
  version: number,
  step: RenameStep,
): void {
  // A broken log reads as empty, so the first step after it starts the log again.
  const log: RenameLog = { schemaVersion: 1, steps: [...readRenames(store, slug, version), step] };
  store.writeText(slug, logPath(version), serializeJson(log));
}

/** The version's steps, oldest first; `[]` when there is no log or it does not read. */
export function readRenames(store: DraftStore, slug: string, version: number): RenameStep[] {
  let raw: unknown;
  try {
    raw = store.readJson(slug, logPath(version));
  } catch {
    // Not JSON: the log only helps the editor, so a broken one never stops an edit.
    return [];
  }
  const parsed = RenameLogSchema.safeParse(raw);
  return parsed.success ? parsed.data.steps : [];
}

/**
 * The id the element `id` had when the session started, following the steps back; `null` when a
 * step created it. `null` too when a step gave the id away and no element got it: the element came
 * from a change the log does not hold (another writer's), so it did not exist at the start.
 */
export function idAtStart(steps: readonly RenameStep[], id: string): string | null {
  let current = id;
  for (const step of [...steps].reverse()) {
    if (step.created.includes(current)) return null;
    const from = Object.entries(step.renames).find(([, to]) => to === current)?.[0];
    if (from !== undefined) current = from;
    else if (Object.hasOwn(step.renames, current)) return null;
  }
  return current;
}
