// One hash over everything a build depends on, shared by the draft build and the catalog build.

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { BuildFs } from '../ports/build-fs.ts';

export type HashInput = {
  /** Bumped when the shape of the output changes. */
  format: number;
  kitHash: string;
  /** Folders whose every file counts, with its relative path. */
  dirs: string[];
  /** Single files: kitvas's runtime, the files a utility build read. A missing one counts as missing. */
  files: string[];
  /** Settings that change the output, such as the probed variables of a catalog. */
  settings?: unknown;
};

export function sourceHash(fs: BuildFs, input: HashInput): string {
  const hash = createHash('sha256').update(
    JSON.stringify([input.format, input.kitHash, input.settings ?? null]),
  );
  for (const [index, dir] of input.dirs.entries()) {
    hash.update(`\0dir ${index}\0`);
    for (const relPath of fs.listFiles(dir)) {
      hash.update(relPath).update(fs.readBytes(join(dir, relPath)));
    }
  }
  for (const file of input.files) {
    hash.update(`\0file ${file}\0`);
    hash.update(fs.exists(file) ? fs.readBytes(file) : '\0missing');
  }
  return hash.digest('hex');
}
