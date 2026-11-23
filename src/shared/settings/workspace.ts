// Creates a project's .kitvas folder. Safe to run twice.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceDir } from '../env/paths.ts';

export function initWorkspace(cwd: string): { path: string; created: boolean } {
  const path = workspaceDir(cwd);
  const config = join(path, 'config.json');
  const created = !existsSync(config);
  for (const folder of ['drafts', 'cache']) mkdirSync(join(path, folder), { recursive: true });
  if (created) {
    writeFileSync(config, `${JSON.stringify({ schemaVersion: 1, kit: 'base' }, null, 2)}\n`);
  }
  return { path, created };
}
