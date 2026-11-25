// What a version's row in the editor says of its last full check (plan 18f, task 1): the counts
// and one screenshot to use as a thumbnail. Read from `build/json/checks.json`; a screenshot the
// file lists but the disk lacks is not offered, so a row never shows a broken image.

import { readChecks } from '../../checks/index.ts';
import { type DraftStore, versionFolder } from '../../drafts/index.ts';

type Listed = { state: string; width: number; file: string };

/** The thumbnail's width: the desktop shot. */
const THUMB_WIDTH = 1280;
/** The state shown first when the check shot more than one. */
const THUMB_STATE = 'filled';
/** `build/shots/<name>.png` as the check file writes it. */
const SHOT_FILE = /^build\/(shots\/[A-Za-z0-9._-]{1,100}\.png)$/;

/**
 * The shot below `build/` to show for a version: the `filled` state at 1280, else any shot at
 * 1280, else none. `exists` tells whether a path (below the version folder) is on disk.
 */
export function pickShot(
  shots: readonly Listed[],
  exists: (path: string) => boolean,
): string | null {
  const wide = shots.filter((shot) => shot.width === THUMB_WIDTH);
  const ordered = [...wide.filter((shot) => shot.state === THUMB_STATE), ...wide];
  for (const shot of ordered) {
    const below = SHOT_FILE.exec(shot.file)?.[1];
    if (below !== undefined && exists(`build/${below}`)) return below;
  }
  return null;
}

export type VersionChecks = {
  shot: string | null;
  check: { fix: number; review: number } | null;
};

export function versionChecks(store: DraftStore, slug: string, number: number): VersionChecks {
  const checks = readChecks(store, slug, number);
  if (!checks) return { shot: null, check: null };
  const base = versionFolder(number);
  return {
    shot: pickShot(checks.shots, (path) => store.exists(slug, `${base}/${path}`)),
    check: { fix: checks.summary.fix, review: checks.summary.review },
  };
}
