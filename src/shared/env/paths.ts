// Where kitvas keeps things: the plugin folder, the user folder, a project's workspace, the data folder.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
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

/** A folder as the file system knows it, links and letter case settled; undefined when it is not there. */
function realFolder(path: string): string | undefined {
  try {
    const real = realpathSync.native(resolve(path));
    return process.platform === 'win32' ? real.toLowerCase() : real;
  } catch {
    return undefined;
  }
}

/**
 * The data folder Claude Code gives this plugin's hook in `CLAUDE_PLUGIN_DATA`. It counts only when
 * `CLAUDE_PLUGIN_ROOT` in the same environment is this plugin's own folder, because a shell can hold the pair of
 * another plugin. The hook gets the folder this way, not as an argument: the plugin directory refuses a hook
 * command that names a variable other than `CLAUDE_PLUGIN_ROOT` (ADR 0071).
 */
export function hookDataDir(
  env: Readonly<Record<string, string | undefined>>,
  root: string,
): string | undefined {
  const { CLAUDE_PLUGIN_DATA: data, CLAUDE_PLUGIN_ROOT: own } = env;
  if (!data || !own) return undefined;
  const ownReal = realFolder(own);
  return ownReal !== undefined && ownReal === realFolder(root) ? data : undefined;
}
