// The trash of deleted drafts as folders under one root: <trash>/<slug>~<stamp>/ (ADR 0064). A
// delete and a restore are one move of the whole folder, so a draft is never half in either place.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { KitvasError } from '../../shared/index.ts';
import { isSlug } from '../domain/names.ts';
import { parseTrashEntry, TRASH_FILE } from '../domain/trash.ts';
import type { DraftTrash } from '../ports/draft-store.ts';
import { isHeldError, renameWithRetry, sleepSync } from './rename-retry.ts';

/** The two calls that can fail because another program holds a file. A test swaps one. */
export type TrashIo = {
  /** Moves a folder to a name that does not exist yet. */
  move(from: string, to: string): void;
  /** Removes a folder and what is in it. */
  remove(path: string): void;
};

const NODE_IO: TrashIo = {
  // A folder a build or a scanner holds for a moment is tried again (rename-retry.ts).
  move: (from, to) => renameWithRetry(from, to, { rename: renameSync, wait: sleepSync }),
  remove: (path) => rmSync(path, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }),
};

/** A file another program still holds after the tries says so; every other failure is thrown as it is. */
function untilFree(slug: string, action: () => void): void {
  try {
    action();
  } catch (error) {
    if (error instanceof KitvasError || !isHeldError(error)) throw error;
    throw new KitvasError('DRAFT_LOCKED', { slug });
  }
}

/** `root` holds the live drafts, `trashRoot` the deleted ones; both may not exist yet. */
export function createFsDraftTrash(
  root: string,
  trashRoot: string,
  io: Partial<TrashIo> = {},
): DraftTrash {
  const trashIo: TrashIo = { ...NODE_IO, ...io };

  /** The folder of an entry; a name kitvas did not make is refused before any path is built. */
  const folderOf = (entry: string): string => {
    if (parseTrashEntry(entry) === undefined) {
      throw new KitvasError('DRAFT_INVALID', { slug: entry, detail: 'trash' });
    }
    return join(trashRoot, entry);
  };

  /** The entry's slug is the one asked for: a restore never lands under another name. */
  const entryFor = (entry: string, slug: string): string => {
    if (!isSlug(slug) || parseTrashEntry(entry)?.slug !== slug) {
      throw new KitvasError('DRAFT_INVALID', { slug, detail: 'trash' });
    }
    return folderOf(entry);
  };

  return {
    entries() {
      if (!existsSync(trashRoot)) return [];
      return readdirSync(trashRoot, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .sort();
    },
    dir: folderOf,
    readText(entry, relPath) {
      const dir = folderOf(entry);
      const file = resolve(dir, relPath);
      if (!file.startsWith(dir + sep) || !existsSync(file)) return undefined;
      return readFileSync(file, 'utf8');
    },
    writeText(entry, relPath, text) {
      const dir = folderOf(entry);
      const file = resolve(dir, relPath);
      if (!file.startsWith(dir + sep)) {
        throw new KitvasError('DRAFT_INVALID', { slug: entry, detail: relPath });
      }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    put(slug, entry) {
      const to = entryFor(entry, slug);
      const from = join(root, slug);
      if (!existsSync(from)) throw new KitvasError('DRAFT_NOT_FOUND', { slug });
      if (existsSync(to)) throw new KitvasError('DRAFT_EXISTS', { slug: entry });
      mkdirSync(trashRoot, { recursive: true });
      untilFree(slug, () => trashIo.move(from, to));
    },
    take(entry, slug) {
      const from = entryFor(entry, slug);
      const to = join(root, slug);
      if (!existsSync(from)) throw new KitvasError('DRAFT_NOT_FOUND', { slug });
      if (existsSync(to)) throw new KitvasError('DRAFT_EXISTS', { slug });
      mkdirSync(root, { recursive: true });
      untilFree(slug, () => trashIo.move(from, to));
      try {
        rmSync(join(to, TRASH_FILE), { force: true });
      } catch {
        // The draft is back; a stray `deleted.json` in it does no harm.
      }
    },
    remove(entry) {
      const dir = folderOf(entry);
      if (!existsSync(dir)) return;
      untilFree(parseTrashEntry(entry)?.slug ?? entry, () => trashIo.remove(dir));
    },
  };
}
