// `kitvas check <slug> [--deep]`: build the latest version of a draft and check it against the kit.

import { dirname, join } from 'node:path';
import {
  type Browser,
  CHECKS,
  type ChecksReport,
  DEEP_VIEWPORTS,
  runChecks,
  type TypeChecker,
} from '../../checks/index.ts';
import { loadSettings } from '../../shared/index.ts';
import { type Command, defineCommand } from '../registry.ts';
import type { BuildDeps } from './build.ts';
import { openDrafts, slugAt } from './draft.ts';

/** `types` and `browser` are called once per run, like `render`. Without `browser`, a11y, ui, ux and runtime are skipped. */
export type CheckCommandDeps = BuildDeps & { types(): TypeChecker; browser?(): Browser };

const INDENT = '          ';
const indent = (text: string): string =>
  text
    .split('\n')
    .map((line) => `${INDENT}${line}`)
    .join('\n');

export function createCheckCommand(deps: CheckCommandDeps): Command {
  return defineCommand<ChecksReport>({
    name: 'check',
    summary: 'command.check.summary',
    async run(ctx) {
      const drafts = openDrafts(deps, ctx);
      const slug = slugAt(ctx, 0);
      const tools = deps.render();
      try {
        const render = { drafts, kits: deps.kits, ...tools };
        const browser = deps.browser?.();
        const options = { render, types: deps.types(), t: ctx.t, ...(browser ? { browser } : {}) };
        // An option beats the project's decisions (`check: deep`), which beat the default.
        const deep =
          ctx.flags.deep || loadSettings({ home: ctx.home, cwd: ctx.cwd }).check === 'deep';
        return await runChecks(options, slug, { deep });
      } finally {
        await tools.bundler.dispose();
        await tools.styles.dispose();
      }
    },
    render(data, t) {
      const { fix, review } = data.summary;
      const where = { slug: data.slug, version: data.version };
      const lines = [
        fix + review === 0
          ? t('check.report.clean', where)
          : t('check.report.head', { ...where, fix, review }),
      ];
      for (const finding of data.findings) {
        const place = finding.file ? `${finding.file}:${finding.line}:${finding.column}` : '';
        const severity = t(`check.severity.${finding.severity}`).padEnd(6);
        lines.push(
          [`  ${severity}`, finding.rule, place, finding.element ?? ''].filter(Boolean).join('  '),
          indent(finding.message),
          indent(finding.hint),
        );
      }
      // Accepted findings (spec 4c, goal 6): listed, counted apart, and not in what must be fixed.
      if (data.waived !== undefined && data.waived.length > 0) {
        lines.push(t('check.report.waived', { count: data.waived.length }));
        for (const finding of data.waived) {
          const place = finding.file ? `${finding.file}:${finding.line}:${finding.column}` : '';
          lines.push(
            ['  ', finding.rule, place, finding.element ?? ''].filter(Boolean).join('  '),
            indent(finding.message),
            indent(t('check.report.waivedReason', { reason: finding.reason })),
          );
        }
      }
      const skipped = CHECKS.filter((name) => data.checks[name] === 'skipped');
      if (skipped.length > 0) lines.push(t('check.report.skipped', { checks: skipped.join(', ') }));
      lines.push(...data.notes);
      if (data.rework !== undefined) lines.push(t('check.report.rework', data.rework));
      if (data.deep === true) {
        const widths = DEEP_VIEWPORTS.map((viewport) => viewport.width).join(', ');
        lines.push(t('check.report.deep', { widths }));
      }
      if (data.shots.length > 0) {
        const dir = join(dirname(dirname(data.path)), 'shots');
        lines.push(t('check.report.shots', { count: data.shots.length, dir }));
      }
      lines.push(t('check.report.saved', { path: data.path }));
      return lines.join('\n');
    },
  });
}
