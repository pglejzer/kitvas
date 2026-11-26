// Writes files into kit folders under one root, the project's `.kitvas/kits/`, into the project's
// additions beside it (`.kitvas/additions/`), and plain files out to a folder.

import {
  type Dirent,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { KitvasError, PLUGIN_ROOT } from '../../shared/index.ts';
import { ADDITIONS_DIR } from '../domain/additions.ts';
import type { KitStore } from '../ports/kit-store.ts';
import type { KitWriter } from '../ports/kit-writer.ts';
import { createAdditionsWriter } from './additions-folder.ts';
import { createFolderKitStore } from './folder-store.ts';
import { kitFile } from './kit-folder.ts';
import { createLayeredKitStore } from './layered-store.ts';

export type FolderWriterOptions = {
  /** The project's additions folder. Default: `additions` beside `root`, `.kitvas/additions`. */
  additions?: string;
  /**
   * Where kits are read from, for the names an addition may not take. Default: the kits shipped
   * with the plugin, then the kits under `root`, as `src/main.ts` layers them.
   */
  kits?: KitStore;
};

/** `root` is the project's `.kitvas/kits`. */
export function createFolderKitWriter(root: string, options: FolderWriterOptions = {}): KitWriter {
  const workspace = dirname(root);
  const kits =
    options.kits ??
    createLayeredKitStore(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), {
      dir: dirname(workspace),
      store: createFolderKitStore(root),
    });
  const additions = createAdditionsWriter({
    root: options.additions ?? join(workspace, ADDITIONS_DIR),
    kits,
  });

  return {
    readText(id, relPath) {
      const file = kitFile(root, id, relPath);
      if (!file) return undefined;
      try {
        return readFileSync(file, 'utf8');
      } catch {
        // Missing, or a folder where a file was expected: either way there is no text to compare.
        return undefined;
      }
    },
    writeText(id, relPath, text) {
      const file = kitFile(root, id, relPath);
      if (!file) throw new KitvasError('KIT_INVALID', { id, detail: relPath });
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    writeBytes(id, relPath, bytes) {
      const file = kitFile(root, id, relPath);
      if (!file) throw new KitvasError('KIT_INVALID', { id, detail: relPath });
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    },
    remove(id, relPath) {
      // The kit folder itself is not a path "inside" it, so it can never be removed from here.
      const file = kitFile(root, id, relPath);
      if (!file) throw new KitvasError('KIT_INVALID', { id, detail: relPath });
      rmSync(file, { recursive: true, force: true });
    },
    listFolder(id, relPath) {
      const dir = kitFile(root, id, relPath);
      if (!dir) throw new KitvasError('KIT_INVALID', { id, detail: relPath });
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return undefined; // missing, or a file where a folder was expected
      }
      const byName = (a: string, b: string): number => (a < b ? -1 : Number(a > b));
      // A link is never followed: it is listed with the folders, as no plain file.
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => ({ name: entry.name, size: statSync(join(dir, entry.name)).size }))
        .sort((a, b) => byName(a.name, b.name));
      const other = entries
        .filter((entry) => !entry.isFile())
        .map((entry) => entry.name)
        .sort(byName);
      return { files, other };
    },
    writeAddition: additions.writeAddition,
    exportFiles: additions.exportFiles,
    syncAdditionsEntry: additions.syncAdditionsEntry,
  };
}
