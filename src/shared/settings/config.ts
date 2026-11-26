// Settings: the user's language, studio idle time and view of the studio from `~/.kitvas/config.json`,
// and the project's kit, copy language and check depth from the front matter of
// `.kitvas/decisions.md` (ADR 0076). The project's kit (`kit use`) and the user's view (the studio's
// View popover) are also written here.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Zod, z } from '../deps/zod.ts';
import { userDir, workspaceDir } from '../env/paths.ts';
import { KitvasError } from '../errors/errors.ts';
import { isRecord } from '../values/guards.ts';
import { type CheckDepth, isValidSetting, parseDecisions, withSetting } from './decisions.ts';
import {
  decisionsPath,
  effectiveSettings,
  readDecisionsText,
  updateDecisions,
} from './project-file.ts';

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

export type Settings = {
  language: string;
  /** The project's kit as `.kitvas/decisions.md` names it, `base` when it says none. */
  kit: string;
  /** The language of the copy in drafts; null when the project's decisions say none. */
  copy: string | null;
  /** How deep `kitvas check` goes when `--deep` is not given. */
  check: CheckDepth;
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

const DEFAULT_USER: UserConfig = {
  schemaVersion: 1,
  language: 'en',
  studioIdleMinutes: STUDIO_IDLE_MINUTES,
};

export function loadSettings({ home, cwd }: { home: string; cwd: string }): Settings {
  const user = readConfig(join(userDir(home), 'config.json'), UserConfigSchema, DEFAULT_USER);
  const workspace = workspaceDir(cwd);
  const { settings } = effectiveSettings(parseDecisions(readDecisionsText(cwd) ?? ''));
  return {
    language: user.language,
    kit: settings.kit,
    copy: settings.copy,
    check: settings.check,
    studioIdleMinutes: user.studioIdleMinutes,
    workspace: { path: workspace, exists: existsSync(workspace) },
  };
}

/**
 * Sets `kit:` in the front matter of `.kitvas/decisions.md`, keeping every other byte of the file.
 * The caller checks that the kit exists; an id that is not one is CONFIG_INVALID.
 */
export function saveProjectKit(cwd: string, id: string): void {
  if (!isValidSetting('kit', id)) {
    throw new KitvasError('CONFIG_INVALID', {
      file: decisionsPath(cwd),
      detail: `kit: "${id}" is not a kit id`,
    });
  }
  updateDecisions(cwd, (text) => withSetting(text, 'kit', id));
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
