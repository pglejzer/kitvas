// Where kitvas keeps things: the plugin folder, the user folder, a project's workspace, the data folder.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const userDir = (home: string): string => join(home, '.kitvas');
export const workspaceDir = (cwd: string): string => join(cwd, '.kitvas');
/** Where a project keeps the kits it learned: `.kitvas/kits`. */
export const projectKitsDir = (cwd: string): string => join(workspaceDir(cwd), 'kits');
/** Where a project keeps the built examples of one kit: `.kitvas/cache/catalog/<kit id>`. */
export const catalogDir = (cwd: string, kitId: string): string =>
  join(workspaceDir(cwd), 'cache', 'catalog', kitId);

export type DataDirInput = { flag?: string | undefined; env?: string | undefined; home: string };

/** The folder that survives plugin updates: flag, then environment, then the pointer the hook wrote, then a default. */
export function resolveDataDir({ flag, env, home }: DataDirInput): string {
  if (flag) return resolve(flag);
  if (env) return resolve(env);
  const pointer = join(userDir(home), 'data-dir');
  if (existsSync(pointer)) {
    const saved = readFileSync(pointer, 'utf8').trim();
    if (saved) return saved;
  }
  return join(userDir(home), 'data');
}
