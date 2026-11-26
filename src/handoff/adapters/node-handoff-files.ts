// The hand-off's files on a real disk.

import { mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { KitvasError } from '../../shared/index.ts';
import type { HandoffFiles, PackageFile } from '../ports/handoff-files.ts';

const isInside = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

export function createNodeHandoffFiles(): HandoffFiles {
  return {
    resolveInside(root, path) {
      try {
        const base = realpathSync(root);
        const real = realpathSync(isAbsolute(path) ? path : resolve(root, path));
        return isInside(base, real) && statSync(real).isFile() ? real : undefined;
      } catch {
        return undefined;
      }
    },
    size(path) {
      try {
        return statSync(path).size;
      } catch {
        return undefined;
      }
    },
    readBytes(path) {
      try {
        return readFileSync(path);
      } catch {
        return undefined;
      }
    },
    readText(path) {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return undefined;
      }
    },
    replaceFolder(dir: string, files: readonly PackageFile[]) {
      const target = resolve(dir);
      const targets = files.map((file) => {
        const full = resolve(target, file.path);
        if (!isInside(target, full)) {
          throw new KitvasError('HANDOFF_OUTSIDE', { path: file.path });
        }
        return { full, content: file.content };
      });
      rmSync(target, { recursive: true, force: true });
      mkdirSync(target, { recursive: true });
      for (const { full, content } of targets) {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
    },
  };
}
