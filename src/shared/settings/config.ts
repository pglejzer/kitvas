// Settings: the user's language and the project's kit, each from its own config.json. The project's
// kit is also written here (`kit use`).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Zod, z } from '../deps/zod.ts';
import { userDir, workspaceDir } from '../env/paths.ts';
import { KitvasError } from '../errors/errors.ts';

export const UserConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  language: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .default('en'),
});

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

export function loadSettings({ home, cwd }: { home: string; cwd: string }): Settings {
  const user = readConfig(join(userDir(home), 'config.json'), UserConfigSchema, {
    schemaVersion: 1,
    language: 'en',
  });
  const workspace = workspaceDir(cwd);
  const project = readConfig(join(workspace, 'config.json'), ProjectConfigSchema, DEFAULT_PROJECT);
  return {
    language: user.language,
    kit: project.kit,
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
