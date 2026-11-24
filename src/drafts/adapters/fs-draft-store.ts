// Drafts as folders under one root: <root>/<slug>/draft.json.

import {
  cpSync,
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
import type { DraftStore } from '../ports/draft-store.ts';
import { createFsDraftTrash, type TrashIo } from './fs-draft-trash.ts';
import { renameWithRetry, sleepSync } from './rename-retry.ts';

/**
 * What `replaceAll` appends to a file's path for the text it writes before the move, and for a
 * file it removes, moved aside until every other file is in place.
 */
export const REPLACE_SUFFIX = '.kitvas-tmp';

/** The file calls `replaceAll` makes. A test swaps one to see a failed move rolled back. */
export type ReplaceIo = {
  /** `undefined` when the file does not exist. */
  read(file: string): string | undefined;
  /** Creates parent folders. */
  write(file: string, text: string): void;
  rename(from: string, to: string): void;
  /** Does nothing when the file does not exist. */
  remove(file: string): void;
};

const NODE_IO: ReplaceIo = {
  read: (file) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
  write: (file, text) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  },
  // A file the build or a scanner holds for a moment is tried again (rename-retry.ts).
  rename: (from, to) => renameWithRetry(from, to, { rename: renameSync, wait: sleepSync }),
  remove: (file) => rmSync(file, { force: true }),
};

/** A rollback step that fails must not stop the others: every file it can put back, it puts back. */
function quietly(step: () => void): void {
  try {
    step();
  } catch {
    // The failure that started the rollback is the one thrown.
  }
}

/** A file `replaceFiles` already put in place, or moved aside to remove it. */
type Moved = { file: string; temporary: string; before: string | undefined; removed: boolean };

/** Undoes one step of `replaceFiles`: the file gets its old text back, or comes back at all. */
function putBack({ file, temporary, before, removed }: Moved, io: ReplaceIo): void {
  if (!removed) {
    quietly(() => {
      if (before === undefined) io.remove(file);
      else io.write(file, before);
    });
    return;
  }
  quietly(() => io.rename(temporary, file));
  // When the rename back failed, the text kept in memory is written instead.
  quietly(() => {
    if (before !== undefined && io.read(file) === undefined) io.write(file, before);
  });
  quietly(() => io.remove(temporary));
}

/** Absolute paths, already checked to be inside the draft. `text: null` removes the file. */
function replaceFiles(targets: { file: string; text: string | null }[], io: ReplaceIo): void {
  // The old texts are kept in memory first, so a failed move can put them back.
  const planned = targets.map(({ file, text }) => ({
    file,
    text,
    temporary: `${file}${REPLACE_SUFFIX}`,
    before: io.read(file),
  }));
  const written: string[] = [];
  const moved: Moved[] = [];
  try {
    for (const { temporary, text } of planned) {
      if (text === null) continue;
      written.push(temporary);
      io.write(temporary, text);
    }
    for (const { file, temporary, text, before } of planned) {
      if (text !== null) {
        io.rename(temporary, file);
        moved.push({ file, temporary, before, removed: false });
      } else if (before !== undefined) {
        // Moved aside, not deleted: until every file is in place, a rollback renames it back.
        io.rename(file, temporary);
        moved.push({ file, temporary, before, removed: true });
      }
    }
  } catch (cause) {
    for (const step of moved) putBack(step, io);
    for (const temporary of written) quietly(() => io.remove(temporary));
    throw cause;
  }
  // Every file is in place: the removed ones can go. One left behind is only a stray file.
  for (const { temporary, removed } of moved) {
    if (removed) quietly(() => io.remove(temporary));
  }
}

/**
 * `io` replaces some of the calls `replaceAll` makes, `trash` some of the calls a delete makes;
 * only tests pass them. Deleted drafts wait in `trash.dir`, by default the `trash` folder beside
 * `root` (`.kitvas/trash` next to `.kitvas/drafts`).
 */
export function createFsDraftStore(
  root: string,
  io: Partial<ReplaceIo> = {},
  trash: { dir?: string; io?: Partial<TrashIo> } = {},
): DraftStore {
  const replaceIo: ReplaceIo = { ...NODE_IO, ...io };

  /** The absolute path of something in a draft, or `undefined` when it would leave the draft. */
  const inside = (slug: string, relPath = '.'): string | undefined => {
    if (!isSlug(slug)) return undefined;
    const dir = resolve(root, slug);
    const target = resolve(dir, relPath);
    return target === dir || target.startsWith(dir + sep) ? target : undefined;
  };

  const required = (slug: string, relPath: string): string => {
    const target = inside(slug, relPath);
    if (!target) throw new KitvasError('DRAFT_INVALID', { slug, detail: relPath });
    return target;
  };

  const readText = (slug: string, relPath: string): string | undefined => {
    const file = inside(slug, relPath);
    return file && existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  };

  return {
    trash: createFsDraftTrash(root, trash.dir ?? join(dirname(root), 'trash'), trash.io),
    list() {
      if (!existsSync(root)) return [];
      return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'draft.json')))
        .map((entry) => entry.name)
        .sort();
    },
    dir: (slug) => join(root, slug),
    exists(slug, relPath) {
      const target = inside(slug, relPath);
      return target !== undefined && existsSync(target);
    },
    readText,
    readJson(slug, relPath) {
      const text = readText(slug, relPath);
      if (text === undefined) return undefined;
      try {
        return JSON.parse(text);
      } catch {
        throw new KitvasError('DRAFT_INVALID', { slug, detail: relPath });
      }
    },
    writeText(slug, relPath, text) {
      const file = required(slug, relPath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    makeDir(slug, relPath) {
      mkdirSync(required(slug, relPath), { recursive: true });
    },
    copyDir(slug, fromRel, toRel) {
      const source = required(slug, fromRel);
      if (existsSync(source)) cpSync(source, required(slug, toRel), { recursive: true });
    },
    replaceAll(slug, files) {
      // Every path is checked before the first byte is written.
      const seen = new Set<string>();
      const targets = files.map(({ relPath, text }) => {
        const file = required(slug, relPath);
        if (seen.has(file)) throw new KitvasError('DRAFT_INVALID', { slug, detail: relPath });
        seen.add(file);
        return { file, text };
      });
      replaceFiles(targets, replaceIo);
    },
  };
}
