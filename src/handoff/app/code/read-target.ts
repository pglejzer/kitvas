// Use case: `kitvas handoff target`. Walks the project (or the folder `--in` names) through the kit
// module's files port and answers with the facts of `targetFacts`. Nothing here names a framework.
// A `.env*` file, a lockfile and `.git/` are never read.

import type { ProjectSetup } from '../../../kit/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { ignoredNames } from '../../domain/code/ignore.ts';
import { isInsideProject, isProtectedPath, normalizeFolder } from '../../domain/code/scope.ts';
import {
  CONVENTION_NAMES,
  TARGET_FILE_CAP,
  TARGET_READ_MAX,
  type TargetFacts,
  targetFacts,
} from '../../domain/code/target.ts';

export type ReadTargetDeps = { files: ProjectSetup };

const decode = (bytes: Uint8Array | undefined): string =>
  bytes === undefined ? '' : new TextDecoder().decode(bytes);

/** A project path under a folder; the root folder is ''. */
export const underBase = (base: string, rel: string): string =>
  base === '' ? rel : `${base}/${rel}`;

/**
 * The folder to read, checked: inside the project (`HANDOFF_OUTSIDE` otherwise, a link that leads
 * out included) and there (`HANDOFF_INVALID` otherwise). '' is the project root.
 */
export function projectBase(files: ProjectSetup, folder: string): string {
  const base = normalizeFolder(folder);
  if (base === '') return '';
  if (!isInsideProject(base)) throw new KitvasError('HANDOFF_OUTSIDE', { path: folder });
  if (!files.exists(base)) {
    throw new KitvasError('HANDOFF_INVALID', { at: base, reason: 'no such folder in the project' });
  }
  if (!files.realInside(base)) throw new KitvasError('HANDOFF_OUTSIDE', { path: folder });
  return base;
}

/** The folders never entered under `base`: the root's `.gitignore` and the folder's own, as plain names. */
export function skipNames(files: ProjectSetup, base: string): string[] {
  const paths = ['.gitignore', ...(base === '' ? [] : [`${base}/.gitignore`])];
  return ignoredNames(paths.map((path) => decode(files.readBytes(path))).join('\n'));
}

export function readTarget(deps: ReadTargetDeps, input: { base: string }): TargetFacts {
  const { files } = deps;
  const base = projectBase(files, input.base);
  const found = files.walk(base, { skip: skipNames(files, base), cap: TARGET_FILE_CAP + 1 });
  const walkCapped = found.length > TARGET_FILE_CAP;
  const list = found.slice(0, TARGET_FILE_CAP).map((rel) => underBase(base, rel));

  let tooLarge = false;
  const read = (path: string): string | undefined => {
    if (isProtectedPath(path)) return undefined;
    const size = files.size(path);
    if (size === undefined) return undefined;
    if (size > TARGET_READ_MAX) {
      tooLarge = true;
      return undefined;
    }
    const bytes = files.readBytes(path);
    return bytes === undefined ? undefined : decode(bytes);
  };

  // The rule files of a project root above the folder read are facts about it too.
  const rootFiles = base === '' ? [] : CONVENTION_NAMES.filter((name) => files.exists(name));
  const facts = targetFacts({
    base,
    files: list,
    read,
    git: files.exists('.git'),
    capped: walkCapped,
    rootFiles,
  });
  return tooLarge ? { ...facts, capped: true } : facts;
}
