// Where a project's installed packages are. Workspaces (npm, Yarn, pnpm) hoist packages into the
// workspace root's node_modules, so a package of the project may sit in a folder above it. The
// search goes up the way Node's does, but stops at the workspace root: a node_modules further up
// belongs to something else.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isRecord } from '../values/guards.ts';

/** A folder that ends a workspace: a repository root or a package.json that declares workspaces. */
function isWorkspaceRoot(dir: string): boolean {
  if (existsSync(join(dir, '.git')) || existsSync(join(dir, 'pnpm-workspace.yaml'))) return true;
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return isRecord(parsed) && parsed.workspaces !== undefined;
  } catch {
    return false;
  }
}

/**
 * node_modules folders Node would search from the project, nearest first, ending at the workspace
 * root: the nearest folder, the project included, with `.git`, `pnpm-workspace.yaml` or a
 * package.json with `workspaces`. Only the project's own when no folder above it is one.
 */
export function nodeModulesFrom(project: string): string[] {
  const start = resolve(project);
  const found: string[] = [];
  let dir = start;
  for (;;) {
    found.push(join(dir, 'node_modules'));
    if (isWorkspaceRoot(dir)) return found;
    const parent = dirname(dir);
    if (parent === dir) return [join(start, 'node_modules')];
    dir = parent;
  }
}

/** The folder of an installed package found through nodeModulesFrom; undefined when none has it. */
export function packageDirFrom(project: string, name: string): string | undefined {
  for (const modules of nodeModulesFrom(project)) {
    const dir = join(modules, ...name.split('/'));
    try {
      if (statSync(join(dir, 'package.json')).isFile()) return dir;
    } catch {
      // Not in this node_modules: look further up.
    }
  }
  return undefined;
}
