// `kitvas decisions …`: read the project's decisions file (`.kitvas/decisions.md`, ADR 0076), keep a
// new decision in it, set one of its settings or swap one decision for another.

import type { KitStore } from '../../../kit/index.ts';
import {
  addDecision,
  DECISION_SECTIONS,
  type DecisionSection,
  decisionsPath,
  decisionWarningText,
  isOneLine,
  isSection,
  isSettingKey,
  isValidSetting,
  KitvasError,
  loadSettings,
  MAX_DECISION_LENGTH,
  type ProjectDecisions,
  readProjectDecisions,
  SETTING_KEYS,
  swapDecision,
  type Translate,
  updateDecisions,
  withSetting,
} from '../../../shared/index.ts';
import { type CommandContext, defineCommand } from '../../registry.ts';

export type DecisionsDeps = {
  /** The kits that exist: a `kit` setting must name one. */
  kits: KitStore;
  /** The clock, for the date of a decision. */
  now?(): Date;
};

/** What `kitvas decisions --json` answers: the file's settings, text and the problems found. */
export type DecisionsShown = Omit<ProjectDecisions, 'warnings'> & {
  warnings: { code: string; line: number; message: string }[];
};
export type DecisionAdded = { path: string; section: DecisionSection; line: number };
export type DecisionSet = { path: string; key: string; value: string };
export type DecisionReplaced = {
  path: string;
  section: DecisionSection;
  old: string;
  line: number;
};
export type DecisionsView = DecisionsShown | DecisionAdded | DecisionSet | DecisionReplaced;

/** `YYYY-MM-DD` of the computer's own day. */
function dayOf(date: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function renderShown(data: DecisionsShown, t: Translate): string {
  if (!data.exists) return t('decisions.show.none', { path: data.path });
  const unset = t('decisions.show.unset');
  const lines = [t('decisions.show.path', { path: data.path })];
  for (const key of SETTING_KEYS) {
    lines.push(
      t('decisions.show.setting', {
        key,
        value: data.settings[key] ?? unset,
        from: t(`decisions.from.${data.from[key]}`),
      }),
    );
  }
  for (const warning of data.warnings) lines.push(t('decisions.show.warning', warning));
  const body = data.text.trim();
  if (body !== '') lines.push('', body);
  return lines.join('\n');
}

function renderView(data: DecisionsView, t: Translate): string {
  if ('settings' in data) return renderShown(data, t);
  if ('key' in data) return t('decisions.set.ok', data);
  if ('old' in data) return t('decisions.replace.ok', data);
  return t('decisions.add.ok', data);
}

export function createDecisionsCommand(deps: DecisionsDeps) {
  const today = (): string => dayOf(deps.now?.() ?? new Date());
  const invalid = (
    ctx: CommandContext,
    key: string,
    params: Record<string, string | number> = {},
  ) => new KitvasError('DECISION_INVALID', { detail: ctx.t(key, params) });
  const requireWorkspace = (ctx: CommandContext): void => {
    if (!loadSettings({ home: ctx.home, cwd: ctx.cwd }).workspace.exists) {
      throw new KitvasError('WORKSPACE_MISSING');
    }
  };
  const sectionOf = (ctx: CommandContext): DecisionSection => {
    const { section } = ctx.flags;
    if (section === undefined || !isSection(section)) {
      throw invalid(ctx, 'decisions.usage.section', { sections: DECISION_SECTIONS.join(', ') });
    }
    return section;
  };
  /** One line of text from an option, trimmed; DECISION_INVALID when it is not one. */
  const lineOf = (ctx: CommandContext, value: string | undefined, usage: string): string => {
    if (value === undefined || !isOneLine(value.trim())) {
      throw invalid(ctx, usage, { max: MAX_DECISION_LENGTH });
    }
    return value.trim();
  };

  return defineCommand<DecisionsView>({
    name: 'decisions',
    summary: 'command.decisions.summary',
    run(ctx) {
      const sub = ctx.positionals[0];
      switch (sub) {
        case undefined:
        case 'show': {
          const found = readProjectDecisions(ctx.cwd, deps.kits.list());
          return {
            ...found,
            warnings: found.warnings.map((warning) => ({
              code: warning.code,
              line: warning.line,
              message: decisionWarningText(ctx.t, warning),
            })),
          };
        }
        case 'add': {
          const section = sectionOf(ctx);
          const text = lineOf(ctx, ctx.flags.text, 'decisions.usage.text');
          requireWorkspace(ctx);
          let line = 0;
          updateDecisions(ctx.cwd, (current) => {
            const added = addDecision(current, section, text, today());
            line = added.line;
            return added.text;
          });
          return { path: decisionsPath(ctx.cwd), section, line };
        }
        case 'set': {
          const key = ctx.positionals[1] ?? '';
          const value = ctx.positionals[2] ?? '';
          if (!isSettingKey(key)) {
            throw invalid(ctx, 'decisions.usage.key', { keys: SETTING_KEYS.join(', ') });
          }
          if (!isValidSetting(key, value))
            throw invalid(ctx, 'decisions.usage.value', { key, value });
          if (key === 'kit' && !deps.kits.list().includes(value)) {
            throw invalid(ctx, 'decisions.usage.kitUnknown', { id: value });
          }
          requireWorkspace(ctx);
          updateDecisions(ctx.cwd, (current) => withSetting(current, key, value));
          return { path: decisionsPath(ctx.cwd), key, value };
        }
        case 'replace': {
          const section = sectionOf(ctx);
          const old = lineOf(ctx, ctx.flags.old, 'decisions.usage.old');
          const text = lineOf(ctx, ctx.flags.text, 'decisions.usage.text');
          requireWorkspace(ctx);
          let line = 0;
          const written = updateDecisions(ctx.cwd, (current) => {
            const swapped = swapDecision(current, section, old, text, today());
            if (swapped === null) return null;
            line = swapped.line;
            return swapped.text;
          });
          if (written === null) throw new KitvasError('DECISION_NOT_FOUND', { section, old });
          return { path: decisionsPath(ctx.cwd), section, old, line };
        }
        default:
          throw new KitvasError('USAGE', {
            detail: ctx.t('decisions.usage.unknown', { name: sub }),
          });
      }
    },
    render: renderView,
  });
}
