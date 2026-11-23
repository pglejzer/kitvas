// Files of a built version that the prototype origin serves: a map from path to file, nothing else.

import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

/** Folders of `build/` that a prototype page loads from. */
export const FRAME_DIRS = ['html', 'js', 'css', 'img'] as const;

/** The only files served, by extension, with their Content-Type. */
export const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function walk(dir: string, prefix: string, found: Map<string, string>): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    // lstat: a symbolic link is neither a folder nor a file here, so it is never followed.
    const stat = lstatSync(full);
    const rel = `${prefix}/${name}`;
    if (stat.isDirectory()) walk(full, rel, found);
    else if (stat.isFile() && Object.hasOwn(CONTENT_TYPES, extname(name).toLowerCase())) {
      found.set(rel, full);
    }
  }
}

/** Every servable file below `buildDir`, keyed by its path there: `css/index.css`. */
export function frameFileMap(buildDir: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const dir of FRAME_DIRS) {
    const full = join(buildDir, dir);
    if (existsSync(full)) walk(full, dir, found);
  }
  return found;
}

/** The file for `relPath` when the map has it and it really lies inside `buildDir`. */
export function frameFile(
  buildDir: string,
  relPath: string,
): { file: string; type: string } | undefined {
  const file = frameFileMap(buildDir).get(relPath);
  if (!file) return undefined;
  const root = realpathSync.native(buildDir);
  const real = realpathSync.native(file);
  if (!real.startsWith(`${root}${sep}`)) return undefined;
  const type = CONTENT_TYPES[extname(file).toLowerCase()];
  return type ? { file: real, type } : undefined;
}
