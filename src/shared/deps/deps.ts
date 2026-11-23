// The one way kitvas loads third-party packages: from the data folder first, then from the plugin folder.

import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLUGIN_ROOT, resolveDataDir } from '../env/paths.ts';
import { KitvasError } from '../errors/errors.ts';

export function defaultDepRoots(): string[] {
  // Only kitvas's own variable: CLAUDE_PLUGIN_DATA in a shell may belong to another plugin.
  const dataDir = resolveDataDir({ env: process.env.KITVAS_DATA_DIR, home: homedir() });
  return [dataDir, PLUGIN_ROOT];
}

function tryResolve(name: string, root: string): string | undefined {
  try {
    return createRequire(join(root, 'package.json')).resolve(name);
  } catch {
    return undefined;
  }
}

/** Absolute path of a package file, from the first root that has it. */
export function resolveDep(name: string, roots: string[]): string {
  for (const root of roots) {
    const file = tryResolve(name, root);
    if (file) return file;
  }
  throw new KitvasError('DEPS_MISSING', { name });
}

export async function loadDep<T>(name: string, roots: string[]): Promise<T> {
  const file = resolveDep(name, roots);
  const loaded = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  const fallback = (loaded.default ?? {}) as Record<string, unknown>;
  return { ...fallback, ...loaded } as T;
}
