// Kits as folders under one root: <root>/<id>/kit.json.

import { type Dirent, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KitvasError } from '../../shared/index.ts';
import type { KitStore } from '../ports/kit-store.ts';
import { kitDir, kitFile } from './kit-folder.ts';

export function createFolderKitStore(root: string): KitStore {
  const parse = (id: string, file: string, label: string): unknown => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new KitvasError('KIT_INVALID', { id, detail: label });
    }
  };

  return {
    list() {
      if (!existsSync(root)) return [];
      return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'kit.json')))
        .map((entry) => entry.name)
        .sort();
    },
    read(id) {
      const file = kitFile(root, id, 'kit.json');
      if (!file || !existsSync(file)) return undefined;
      return { id, dir: kitDir(root, id), kitJson: parse(id, file, 'kit.json') };
    },
    readJson(id, relPath) {
      const file = kitFile(root, id, relPath);
      if (!file || !existsSync(file)) return undefined;
      return parse(id, file, relPath);
    },
    exists(id, relPath) {
      const file = kitFile(root, id, relPath);
      return file !== undefined && existsSync(file);
    },
    readTree(id, dir) {
      const start = kitFile(root, id, dir);
      if (!start) return {};
      const found: [string, string][] = [];
      const walk = (folder: string, prefix: string): void => {
        let entries: Dirent[];
        try {
          entries = readdirSync(folder, { withFileTypes: true });
        } catch {
          return; // missing, or a file where a folder was expected
        }
        for (const entry of entries) {
          const rel = `${prefix}/${entry.name}`;
          if (entry.isDirectory()) walk(join(folder, entry.name), rel);
          else if (entry.isFile())
            found.push([rel, readFileSync(join(folder, entry.name), 'utf8')]);
        }
      };
      walk(start, dir.replace(/\/+$/, ''));
      // Sorted by path so the hash does not depend on the order the file system lists.
      found.sort(([a], [b]) => (a < b ? -1 : Number(a > b)));
      return Object.fromEntries(found);
    },
  };
}
