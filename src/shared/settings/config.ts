// Settings: the user's language, studio idle time and view of the studio, and the project's kit,
// each from its own config.json. The project's kit (`kit use`) and the user's view (the studio's
// View popover) are also written here.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Zod, z } from '../deps/zod.ts';
import { userDir, workspaceDir } from '../env/paths.ts';
import { KitvasError } from '../errors/errors.ts';

/** A studio nobody uses stops after 4 hours unless the user says otherwise (ADR 0042). */
export const STUDIO_IDLE_MINUTES = 240;
/** One week: a longer wait is the same as never stopping, which 0 already says. */
export const MAX_STUDIO_IDLE_MINUTES = 10_080;

export const VIEW_THEMES = ['system', 'light', 'dark'] as const;
export const VIEW_PANELS = ['cards', 'flush'] as const;
export const VIEW_ACCENTS = ['copper', 'teal', 'coral', 'rose'] as const;

/**
 * How the studio looks for this person (ADR 0057): the theme (`system` follows the computer),
 * the panels as islands or flush, and the accent.
 */
export const ViewSettingsSchema = z.strictObject({
  theme: z.enum(VIEW_THEMES),
  panels: z.enum(VIEW_PANELS),
  accent: z.enum(VIEW_ACCENTS),
});

export type ViewSettings = Zod.infer<typeof ViewSettingsSchema>;

export const DEFAULT_VIEW: ViewSettings = { theme: 'system', panels: 'cards', accent: 'copper' };

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
  /** Absent until the person changes something in the View popover. */
  view: ViewSettingsSchema.optional(),
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

/** What `file` holds, unchecked; `undefined` when there is no file. */
function readRaw(file: string): unknown {
  if (!existsSync(file)) return undefined;
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return raw;
  } catch {
    throw new KitvasError('CONFIG_INVALID', { file, detail: 'the file is not valid JSON' });
  }
}

function readConfig<T>(file: string, schema: Zod.ZodType<T>, fallback: T): T {
  const raw = readRaw(file);
  return raw === undefined ? fallback : parseConfig(file, schema, raw);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

/** Reads and writes the user's view of the studio; the studio's pages and its API use it. */
export type ViewStore = { read(): ViewSettings; write(view: ViewSettings): void };

/**
 * The view kept in the user's `config.json`. A read never throws: a look setting must not take a
 * page down, so a missing or broken file answers the last view read, or the default. A write
 * keeps the rest of the file as the person wrote it: a setting the file leaves out stays out, so
 * it keeps following its default. Into a broken file a write is CONFIG_INVALID, as for the
 * project's kit.
 */
export function createViewStore(home: string): ViewStore {
  const file = join(userDir(home), 'config.json');
  let last: ViewSettings = DEFAULT_VIEW;
  return {
    read() {
      try {
        last = readConfig(file, UserConfigSchema, DEFAULT_USER).view ?? DEFAULT_VIEW;
      } catch (error) {
        if (!(error instanceof KitvasError)) throw error;
      }
      return last;
    },
    write(view) {
      const raw = readRaw(file) ?? { schemaVersion: 1 };
      // Checked as it is first: a file that is wrong already is never written over.
      parseConfig(file, UserConfigSchema, raw);
      const next = { ...(isRecord(raw) ? raw : {}), view };
      parseConfig(file, UserConfigSchema, next);
      mkdirSync(userDir(home), { recursive: true });
      writeFileSync(
        file,
        `${JSON.stringify(next, null, 2)}
`,
      );
      last = view;
    },
  };
}

/** A view kept only in memory: a studio started without a home folder, as tests do. */
export function memoryViewStore(start: ViewSettings = DEFAULT_VIEW): ViewStore {
  let view = start;
  return {
    read: () => view,
    write(next) {
      view = next;
    },
  };
}
