// Use case: the listing of a project before and after the fitter writes. Each file with its size and
// hash, so `projectChanges` can say what changed without a git command. A file over TARGET_READ_MAX,
// a `.env*` file and a lockfile are listed by size only: they are never read.

import { createHash } from 'node:crypto';
import type { ProjectSetup } from '../../../kit/index.ts';
import type { ProjectListing } from '../../domain/code/listing.ts';
import { isProtectedPath } from '../../domain/code/scope.ts';
import { TARGET_FILE_CAP, TARGET_READ_MAX } from '../../domain/code/target.ts';
import { projectBase, skipNames, underBase } from './read-target.ts';

export type ListProjectDeps = { files: ProjectSetup };

/** `<size>:<sha1>`; the hash is '' when the file may not be read; `?:` when its size is unknown. */
function entryOf(files: ProjectSetup, path: string): string {
  const size = files.size(path);
  if (size === undefined) return '?:';
  if (size > TARGET_READ_MAX || isProtectedPath(path)) return `${size}:`;
  const bytes = files.readBytes(path);
  if (bytes === undefined) return `${size}:`;
  return `${size}:${createHash('sha1').update(bytes).digest('hex')}`;
}

/**
 * Every file under `base` ('' watches the whole project) that is not in a skipped folder. Over
 * TARGET_FILE_CAP files the listing is not taken: `watched` is false and `files` is empty.
 */
export function listProject(deps: ListProjectDeps, input: { base: string }): ProjectListing {
  const { files } = deps;
  const base = projectBase(files, input.base);
  const found = files.walk(base, { skip: skipNames(files, base), cap: TARGET_FILE_CAP + 1 });
  if (found.length > TARGET_FILE_CAP) return { schemaVersion: 1, watched: false, files: {} };
  const entries = found.map((rel): [string, string] => {
    const path = underBase(base, rel);
    return [path, entryOf(files, path)];
  });
  return { schemaVersion: 1, watched: true, files: Object.fromEntries(entries) };
}
