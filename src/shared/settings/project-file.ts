// The project's `.kitvas/decisions.md` on disk (ADR 0076): reading it into settings, writing one
// change at a time, and the one-time move from the older `.kitvas/config.json`.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceDir } from '../env/paths.ts';
import { KitvasError } from '../errors/errors.ts';
import {
  DEFAULT_DECISION_SETTINGS,
  type DecisionSettings,
  type DecisionWarning,
  decisionsTemplate,
  type ParsedDecisions,
  parseDecisions,
  type SettingKey,
} from './decisions.ts';

export const DECISIONS_FILE = 'decisions.md';

export const decisionsPath = (cwd: string): string => join(workspaceDir(cwd), DECISIONS_FILE);

export type SettingSource = 'file' | 'default';

/** What `kitvas decisions --json` answers. */
export type ProjectDecisions = {
  path: string;
  exists: boolean;
  settings: DecisionSettings;
  from: Record<SettingKey, SettingSource>;
  text: string;
  warnings: DecisionWarning[];
};

/**
 * A workspace from before has `config.json` and no decisions file: its kit moves into a new
 * decisions file and the old file goes. A `config.json` that is not JSON stays and is CONFIG_INVALID.
 */
function migrateConfig(cwd: string): void {
  const old = join(workspaceDir(cwd), 'config.json');
  const file = decisionsPath(cwd);
  if (!existsSync(old) || existsSync(file)) return;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(old, 'utf8'));
  } catch {
    throw new KitvasError('CONFIG_INVALID', { file: old, detail: 'the file is not valid JSON' });
  }
  // Only the two fields the old project file had: in the home folder the same path is the user's
  // config (language, view), which is not touched.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return;
  if (Object.keys(raw).some((key) => key !== 'schemaVersion' && key !== 'kit')) return;
  const kit = 'kit' in raw && typeof raw.kit === 'string' ? raw.kit : 'base';
  // A value that does not fit a line of the front matter is not carried over.
  writeFileSync(file, decisionsTemplate(/^\S+$/.test(kit) ? kit : 'base'));
  unlinkSync(old);
}

/** The decisions file as text; undefined when there is none (a workspace from before is moved first). */
export function readDecisionsText(cwd: string): string | undefined {
  if (!existsSync(workspaceDir(cwd))) return undefined;
  migrateConfig(cwd);
  const file = decisionsPath(cwd);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/**
 * Writes the file `change` makes of the current one (the template when there is none); `change`
 * answering null writes nothing. Answers the new text, or null.
 */
export function updateDecisions(
  cwd: string,
  change: (text: string) => string | null,
): string | null {
  const next = change(readDecisionsText(cwd) ?? decisionsTemplate());
  if (next === null) return null;
  mkdirSync(workspaceDir(cwd), { recursive: true });
  writeFileSync(decisionsPath(cwd), next);
  return next;
}

/**
 * The effective settings of a parsed file: its values, else the defaults. With `kits` (the ids that
 * exist) a kit that is not among them is a warning and `base`.
 */
export function effectiveSettings(
  parsed: ParsedDecisions,
  kits?: readonly string[],
): Pick<ProjectDecisions, 'settings' | 'from' | 'warnings'> {
  const settings: DecisionSettings = { ...DEFAULT_DECISION_SETTINGS };
  const from: Record<SettingKey, SettingSource> = {
    kit: 'default',
    copy: 'default',
    check: 'default',
  };
  const warnings = [...parsed.warnings];
  const { kit, copy, check } = parsed.settings;
  if (kit !== undefined) {
    settings.kit = kit;
    from.kit = 'file';
  }
  if (copy !== undefined && copy !== null) {
    settings.copy = copy;
    from.copy = 'file';
  }
  if (check !== undefined) {
    settings.check = check;
    from.check = 'file';
  }
  if (from.kit === 'file' && kits !== undefined && !kits.includes(settings.kit)) {
    warnings.push({
      code: 'kitMissing',
      line: parsed.lines.kit ?? 1,
      params: { id: settings.kit },
    });
    settings.kit = DEFAULT_DECISION_SETTINGS.kit;
    from.kit = 'default';
  }
  warnings.sort((a, b) => a.line - b.line);
  return { settings, from, warnings };
}

/** Everything `kitvas decisions` reports; without a workspace, the defaults and no text. */
export function readProjectDecisions(cwd: string, kits?: readonly string[]): ProjectDecisions {
  const text = readDecisionsText(cwd);
  const parsed = parseDecisions(text ?? '');
  const { settings, from, warnings } = effectiveSettings(parsed, kits);
  return {
    path: decisionsPath(cwd),
    exists: text !== undefined,
    settings,
    from,
    text: parsed.body,
    warnings,
  };
}
