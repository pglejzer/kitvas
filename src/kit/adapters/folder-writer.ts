// Writes files into kit folders under one root, the project's `.kitvas/kits/`.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { KitvasError } from '../../shared/index.ts';
import type { KitWriter } from '../ports/kit-writer.ts';
import { kitFile } from './kit-folder.ts';

export function createFolderKitWriter(root: string): KitWriter {
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
  };
}
