// Creates a project's .kitvas folder with its decisions file. Safe to run twice.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceDir } from '../env/paths.ts';
import { decisionsTemplate } from './decisions.ts';
import { DECISIONS_FILE, readDecisionsText } from './project-file.ts';

export function initWorkspace(cwd: string): { path: string; created: boolean } {
  const path = workspaceDir(cwd);
  const decisions = join(path, DECISIONS_FILE);
  // A workspace from before has a config.json: its kit moves into the decisions file first.
  readDecisionsText(cwd);
  const created = !existsSync(decisions);
  for (const folder of ['drafts', 'cache']) mkdirSync(join(path, folder), { recursive: true });
  if (created) writeFileSync(decisions, decisionsTemplate());
  return { path, created };
}
