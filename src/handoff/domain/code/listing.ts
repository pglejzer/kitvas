// The listing of a project before and after a hand-off, the word that says where the fitter may
// write, and the diff of two listings (`projectChanges`). kitvas runs no git command: it compares
// what it listed, so it works in a folder without git and never touches an index.

import { isProtectedPath, isUnder, normalizeFolder } from './scope.ts';

/** Path to `<size>:<sha1>`; the hash is '' for a file over TARGET_READ_MAX. */
export type ProjectListing = {
  schemaVersion: 1;
  watched: boolean;
  files: Record<string, string>;
};

/** `new`: new files in the folder. `named`: also the existing files the person names. `open`: wherever needed. */
export const WRITE_SCOPES = ['new', 'named', 'open'] as const;
export type WriteScope = (typeof WRITE_SCOPES)[number];

export type WriteSet = { to: string; scope: WriteScope; files: string[] };

export type ProjectChanges = {
  watched: boolean;
  inside: string[];
  outside: string[];
  removed: string[];
};

const byText = (a: string, b: string): number => (a < b ? -1 : Number(a > b));

/**
 * What changed between two listings, and whether the person's word allowed it. A file is changed
 * when it is new or its entry differs. It is `inside` when the scope is `open`, or it is new and
 * under `write.to`, or the scope is `named` and the file is on `write.files`; every other change is
 * `outside`, whoever made it: kitvas does not guess who wrote a file. A file kitvas never writes
 * (`.env*`, a lockfile, `.git/`) is `outside` even with scope `open`. A file in the first listing and
 * not in the second is `removed`. Without a watched listing on both sides nothing is said.
 */
export function projectChanges(
  before: ProjectListing,
  after: ProjectListing,
  write: WriteSet,
): ProjectChanges {
  if (!before.watched || !after.watched) {
    return { watched: false, inside: [], outside: [], removed: [] };
  }
  const to = normalizeFolder(write.to);
  const inside: string[] = [];
  const outside: string[] = [];
  for (const [path, entry] of Object.entries(after.files)) {
    const was = Object.hasOwn(before.files, path) ? before.files[path] : undefined;
    if (was === entry) continue;
    const isNew = was === undefined;
    const allowed =
      !isProtectedPath(path) &&
      (write.scope === 'open' ||
        (isNew && isUnder(path, to)) ||
        (write.scope === 'named' && write.files.includes(path)));
    (allowed ? inside : outside).push(path);
  }
  const removed = Object.keys(before.files).filter((path) => !Object.hasOwn(after.files, path));
  return {
    watched: true,
    inside: inside.sort(byText),
    outside: outside.sort(byText),
    removed: removed.sort(byText),
  };
}
