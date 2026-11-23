// The running studio of a project, as its process writes it for the CLI: pid, ports, token, version.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Zod, z } from '../../shared/index.ts';

export const StudioStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pid: z.number().int().positive(),
  /** The shared browser, while one runs. */
  browserPid: z.number().int().positive().optional(),
  port: z.number().int().positive(),
  framePort: z.number().int().positive(),
  token: z.string().min(32),
  version: z.string(),
  project: z.string(),
  startedAt: z.string(),
});

export type StudioState = Zod.infer<typeof StudioStateSchema>;

export type StudioFiles = {
  /** `<key>.json`: the running studio, while it runs. */
  state: string;
  /** `<key>.log`: what a detached studio writes. */
  log: string;
  /** `<key>.ports.json`: the ports of the first start, tried again by every later one. */
  ports: string;
  /** `<key>.secret`: the page secret, kept across starts (`run/secret-file.ts`). */
  secret: string;
};

/** A project's studio files in `<data>/studio/`; the key is 16 hex characters of its path's hash. */
export function studioFiles(dataDir: string, project: string): StudioFiles {
  const key = createHash('sha256').update(project).digest('hex').slice(0, 16);
  const at = (suffix: string): string => join(dataDir, 'studio', `${key}${suffix}`);
  return { state: at('.json'), log: at('.log'), ports: at('.ports.json'), secret: at('.secret') };
}

/** The state in `file`; `undefined` when it is missing or not a state file. */
export function readState(file: string): StudioState | undefined {
  try {
    const parsed = StudioStateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Written whole or not at all, readable by the user only: the token is in it. */
export function writeState(file: string, state: StudioState): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
}

/** Removes the file; with `pid`, only while it still names that process, never a newer studio's. */
export function removeState(file: string, pid?: number): void {
  if (pid !== undefined && readState(file)?.pid !== pid) return;
  rmSync(file, { force: true });
}
