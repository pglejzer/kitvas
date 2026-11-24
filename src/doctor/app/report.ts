// The doctor's text: the lines a person reads, and the report to paste into an issue.

import type { Translate } from '../../shared/index.ts';
import { type CheckResult, tally } from '../domain/check.ts';
import { redact } from '../domain/redact.ts';

const ID_WIDTH = 9;

function label(t: Translate, result: CheckResult): string {
  return t(`doctor.status.${result.status}`).padEnd(5);
}

/** One line per check: its state, its name, what was found and what to do. */
export function checkLines(t: Translate, results: readonly CheckResult[]): string[] {
  return results.map((result) => {
    const fix = result.fix === undefined ? '' : ` ${t('doctor.fixPrefix', { text: result.fix })}`;
    return `${label(t, result)} ${result.id.padEnd(ID_WIDTH)} ${result.detail}${fix}`;
  });
}

/** What the person reads at the terminal: the lines and one summary line. */
export function renderChecks(t: Translate, results: readonly CheckResult[]): string {
  return [...checkLines(t, results), '', t('doctor.summary', tally(results))].join('\n');
}

export type ReportInput = {
  t: Translate;
  version: string;
  nodeVersion: string;
  system: { os: string; arch: string };
  home: string;
  project: string;
  checks: readonly CheckResult[];
};

/**
 * One block of plain text for an issue: the version, the system, one line per check. The finished
 * text goes through `redact`, so nothing private is in it.
 */
export function buildReport(input: ReportInput): string {
  const { t } = input;
  const text = [
    t('doctor.report.title'),
    t('doctor.report.version', { version: input.version }),
    t('doctor.report.os', { os: input.system.os, arch: input.system.arch }),
    t('doctor.report.node', { node: input.nodeVersion }),
    ...checkLines(t, input.checks),
  ].join('\n');
  return redact(text, { home: input.home, project: input.project });
}
