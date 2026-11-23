// `kitvas guidelines [<id>] [--check] [--mode] [--screen]`: the guideline book, in words.

import { type Guideline, guidelineFor, guidelinesWhere } from '../../checks/index.ts';
import { SCREEN_KINDS } from '../../drafts/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import { defineCommand } from '../registry.ts';

export type GuidelineView = Guideline & { rule: string; why: string };
export type GuidelinesAnswer = { guidelines: GuidelineView[] };

const CHECK_VALUES: readonly string[] = ['a11y', 'ui', 'ux'];
const MODE_VALUES: readonly string[] = ['auto', 'deep', 'manual'];

/** The flag's value when it is one of `allowed`; a usage error when it is not. */
function oneOf(
  t: Translate,
  flag: 'check' | 'mode' | 'screen',
  value: string | undefined,
  allowed: readonly string[],
): string | undefined {
  if (value === undefined) return undefined;
  if (allowed.includes(value)) return value;
  throw new KitvasError('USAGE', {
    detail: t('guidelines.usage.flag', { flag, value, allowed: allowed.join(', ') }),
  });
}

function viewOf(entry: Guideline, t: Translate): GuidelineView {
  return {
    ...entry,
    rule: t(`guideline.${entry.key}.rule`),
    why: t(`guideline.${entry.key}.why`),
  };
}

function renderEntry(view: GuidelineView, t: Translate): string {
  const lines = [
    t('guidelines.header', {
      id: view.id,
      mode: view.mode,
      severity: view.severity ?? t('guidelines.severity.none'),
      basis: t(`guidelines.basis.${view.basis}`),
    }),
    `  ${view.rule}`,
    `  ${view.why}`,
  ];
  const thresholds = Object.entries(view.thresholds).map(([name, value]) => `${name}=${value}`);
  if (thresholds.length > 0)
    lines.push(`  ${t('guidelines.thresholds', { list: thresholds.join(' ') })}`);
  for (const source of view.sources) lines.push(`  ${source.name}: ${source.url}`);
  return lines.join('\n');
}

export const guidelinesCommand = defineCommand<GuidelinesAnswer>({
  name: 'guidelines',
  summary: 'command.guidelines.summary',
  run({ positionals, flags, t }) {
    const check = oneOf(t, 'check', flags.check, CHECK_VALUES);
    const mode = oneOf(t, 'mode', flags.mode, MODE_VALUES);
    const screen = oneOf(t, 'screen', flags.screen, SCREEN_KINDS);
    const id = positionals[0];
    if (id !== undefined) {
      const entry = guidelineFor(id);
      if (!entry) throw new KitvasError('GUIDELINE_UNKNOWN', { id });
      return { guidelines: [viewOf(entry, t)] };
    }
    const found = guidelinesWhere({
      ...(check === undefined ? {} : { check: check as Guideline['check'] }),
      ...(mode === undefined ? {} : { mode: mode as Guideline['mode'] }),
      ...(screen === undefined ? {} : { screen }),
    });
    return { guidelines: found.map((entry) => viewOf(entry, t)) };
  },
  render: (data, t) =>
    data.guidelines.length === 0
      ? t('guidelines.empty')
      : data.guidelines.map((view) => renderEntry(view, t)).join('\n\n'),
});
