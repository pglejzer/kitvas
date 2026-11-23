// Paths in one spelling. Tools answer with long names while a temp folder on Windows may be given
// in its short form (`RUNNER~1`); comparing the two needs the system's own spelling.

import { realpathSync } from 'node:fs';
import { relative, sep } from 'node:path';

export function realPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

/** `file` relative to `dir`, with forward slashes. */
export const relativeFile = (dir: string, file: string): string =>
  relative(realPath(dir), realPath(file)).split(sep).join('/');
