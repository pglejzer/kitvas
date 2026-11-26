// Paths and the write scope, shared by `readFit` and by the diff of two listings (task 1). Pure
// string work: nothing here touches a disk.

import type { WriteSet } from './listing.ts';

/**
 * A path inside the project, from its root: forward slashes, no leading or trailing slash, no
 * drive letter, no `.` or `..` segment, no empty segment.
 */
export const PROJECT_REL =
  /^(?!\/)(?!.*\/$)(?!.*\/\/)(?!.*\\)(?!.*:)(?!.*(?:^|\/)\.\.?(?:\/|$)).+$/;

/** A path kitvas and the fitter never write: `.git/`, `.env*` files and lockfiles. */
const PROTECTED = [
  /(?:^|\/)\.git(?:\/|$)/,
  /(?:^|\/)\.env(?:\.[^/]*)?$/,
  /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/,
  /(?:^|\/)[^/]*\.lock$/,
  /(?:^|\/)go\.sum$/,
];

export const isInsideProject = (path: string): boolean => PROJECT_REL.test(path);

export const isProtectedPath = (path: string): boolean => PROTECTED.some((rule) => rule.test(path));

/** A folder as the write set holds it: no `./`, no trailing slash; the root is ''. */
export function normalizeFolder(folder: string): string {
  const trimmed = folder
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '');
  return trimmed === '.' ? '' : trimmed;
}

/** True when `path` is the folder or lies under it; the root folder ('') holds every path. */
export function isUnder(path: string, folder: string): boolean {
  const base = normalizeFolder(folder);
  return base === '' || path === base || path.startsWith(`${base}/`);
}

/**
 * Whether the person's word lets a file be written at `path`. `open`: anywhere. `new` and `named`:
 * under the folder; `named` also the files on the list. Whether the file is new or already there is
 * the diff's business, not this function's.
 */
export function inWriteSet(path: string, write: WriteSet): boolean {
  if (write.scope === 'open') return true;
  if (isUnder(path, write.to)) return true;
  return write.scope === 'named' && write.files.includes(path);
}
