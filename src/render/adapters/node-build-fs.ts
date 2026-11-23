// Build files on the local disk.

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { BuildFs } from '../ports/build-fs.ts';

export function createNodeBuildFs(): BuildFs {
  return {
    exists: (path) => existsSync(path),
    listFiles(dir) {
      if (!existsSync(dir)) return [];
      return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
        .sort();
    },
    readBytes: (file) => readFileSync(file),
    readText: (file) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
    writeText(file, text) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    remove(path) {
      rmSync(path, { recursive: true, force: true });
    },
    copyDir(from, to) {
      if (existsSync(from)) cpSync(from, to, { recursive: true });
    },
    copyFile(from, to) {
      if (!existsSync(from)) return;
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    },
  };
}
