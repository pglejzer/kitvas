// Settings: the user's language and studio idle time, and the project's kit, each from its own
// config.json. The project's kit is also written here (`kit use`).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Zod, z } from '../deps/zod.ts';
import { userDir, workspaceDir } from '../env/paths.ts';
import { KitvasError } from '../errors/errors.ts';

/** A studio nobody uses stops after 4 hours unless the user says otherwise (ADR 0042). */
export const STUDIO_IDLE_MINUTES = 240;
/** One week: a longer wait is the same as never stopping, which 0 already says. */
export const MAX_STUDIO_IDLE_MINUTES = 10_080;

export const UserConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  language: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .default('en'),
  /** Minutes without use before the studio stops by itself; 0 never stops it. */
  studioIdleMinutes: z
    .number()
    .int()
    .min(0)
    .max(MAX_STUDIO_IDLE_MINUTES)
    .default(STUDIO_IDLE_MINUTES),
});

export type UserConfig = Zod.infer<typeof UserConfigSchema>;

export const ProjectConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kit: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
    .default('base'),
});

export type ProjectConfig = Zod.infer<typeof ProjectConfigSchema>;

export type Settings = {
  language: string;
  kit: string;
  /** Minutes without use before the studio stops by itself; 0 never stops it. */
  studioIdleMinutes: number;
  workspace: { path: string; exists: boolean };
};

/** `raw` checked against the schema of `file`; CONFIG_INVALID names the first wrong field. */
function parseConfig<T>(file: string, schema: Zod.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  const where = first?.path.join('.') || 'file';
  throw new KitvasError('CONFIG_INVALID', { file, detail: `${where}: ${first?.message ?? ''}` });
}

function readConfig<T>(file: string, schema: Zod.ZodType<T>, fallback: T): T {
  if (!existsSync(file)) return fallback;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new KitvasError('CONFIG_INVALID', { file, detail: 'the file is not valid JSON' });
  }
  return parseConfig(file, schema, raw);
}

const DEFAULT_PROJECT: ProjectConfig = { schemaVersion: 1, kit: 'base' };
const DEFAULT_USER: UserConfig = {
  schemaVersion: 1,
  language: 'en',
  studioIdleMinutes: STUDIO_IDLE_MINUTES,
};

export function loadSettings({ home, cwd }: { home: string; cwd: string }): Settings {
  const user = readConfig(join(userDir(home), 'config.json'), UserConfigSchema, DEFAULT_USER);
  const workspace = workspaceDir(cwd);
  const project = readConfig(join(workspace, 'config.json'), ProjectConfigSchema, DEFAULT_PROJECT);
  return {
    language: user.language,
    kit: project.kit,
    studioIdleMinutes: user.studioIdleMinutes,
    workspace: { path: workspace, exists: existsSync(workspace) },
  };
}

/**
 * Sets the project's kit in `.kitvas/config.json`, keeping the rest of the file. The caller checks
 * that the kit exists; a config that is broken already, or an id that is not one, is CONFIG_INVALID.
 */
export function saveProjectKit(cwd: string, id: string): void {
  const workspace = workspaceDir(cwd);
  const file = join(workspace, 'config.json');
  const current = readConfig(file, ProjectConfigSchema, DEFAULT_PROJECT);
  const next = parseConfig(file, ProjectConfigSchema, { ...current, kit: id });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
}
