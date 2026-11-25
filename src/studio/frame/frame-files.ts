// Files of a built version that the prototype origin serves: a map from path to file, nothing else.

import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import { PREVIEWS_DIR } from '../../checks/index.ts';

/**
 * Folders of `build/` that a prototype page loads from, and `shots`, the full check's screenshots
 * the editor's Versions list shows as thumbnails (plan 18f): PNG files only, below the same key.
 */
export const FRAME_DIRS = ['html', 'js', 'css', 'img', 'shots'] as const;

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

/** What one kind of address may serve: folders below its root, and the file types. */
export type Served = { dirs: readonly string[]; types: Record<string, string> };

const BUILD: Served = { dirs: FRAME_DIRS, types: CONTENT_TYPES };

/**
 * The Insert pane's previews of a kit (ADR 0075): the folder `kit previews` writes beside `build/`,
 * served from the kit's catalog folder; PNG files only.
 */
export const SERVED_PREVIEWS: Served = { dirs: [PREVIEWS_DIR], types: { '.png': 'image/png' } };

function walk(
  dir: string,
  prefix: string,
  types: Record<string, string>,
  found: Map<string, string>,
): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    // lstat: a symbolic link is neither a folder nor a file here, so it is never followed.
    const stat = lstatSync(full);
    const rel = `${prefix}/${name}`;
    if (stat.isDirectory()) walk(full, rel, types, found);
    else if (stat.isFile() && Object.hasOwn(types, extname(name).toLowerCase())) {
      found.set(rel, full);
    }
  }
}

/** Every servable file below `buildDir`, keyed by its path there: `css/index.css`. */
export function frameFileMap(buildDir: string, served: Served = BUILD): Map<string, string> {
  const found = new Map<string, string>();
  for (const dir of served.dirs) {
    const full = join(buildDir, dir);
    if (existsSync(full)) walk(full, dir, served.types, found);
  }
  return found;
}

/**
 * The file for `relPath` when the map has it and it really lies inside `buildDir`. `served` names
 * the folders and types of the address: a built version's or catalog's `build/` by default, or a
 * kit's previews with `SERVED_PREVIEWS` over its catalog folder.
 */
export function frameFile(
  buildDir: string,
  relPath: string,
  served: Served = BUILD,
): { file: string; type: string } | undefined {
  const file = frameFileMap(buildDir, served).get(relPath);
  if (!file) return undefined;
  const root = realpathSync.native(buildDir);
  const real = realpathSync.native(file);
  if (!real.startsWith(`${root}${sep}`)) return undefined;
  const type = served.types[extname(file).toLowerCase()];
  return type ? { file: real, type } : undefined;
}
