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

/** What `replaceAll` appends to a file's path for the text it writes before the move. */
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
  rename: (from, to) => renameSync(from, to),
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

/** Absolute paths, already checked to be inside the draft. */
function replaceFiles(targets: { file: string; text: string }[], io: ReplaceIo): void {
  // The old texts are kept in memory first, so a failed move can put them back.
  const planned = targets.map(({ file, text }) => ({
    file,
    text,
    temporary: `${file}${REPLACE_SUFFIX}`,
    before: io.read(file),
  }));
  const written: string[] = [];
  const moved: { file: string; before: string | undefined }[] = [];
  try {
    for (const { temporary, text } of planned) {
      written.push(temporary);
      io.write(temporary, text);
    }
    for (const { file, temporary, before } of planned) {
      io.rename(temporary, file);
      moved.push({ file, before });
    }
  } catch (cause) {
    for (const { file, before } of moved) {
      quietly(() => {
        if (before === undefined) io.remove(file);
        else io.write(file, before);
      });
    }
    for (const temporary of written) quietly(() => io.remove(temporary));
    throw cause;
  }
}

/** `io` replaces some of the calls `replaceAll` makes; only tests pass it. */
export function createFsDraftStore(root: string, io: Partial<ReplaceIo> = {}): DraftStore {
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
