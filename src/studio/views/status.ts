// What the studio says about a version: its status, the findings to show and the next step.

import { type ChecksFile, type Finding, GUIDELINES, sortFindings } from '../../checks/index.ts';
import { WIDTHS, type Width } from './draft-query.ts';

export type DraftStatus =
  | { kind: 'unreadable' }
  | { kind: 'notBuilt' }
  | { kind: 'notChecked' }
  | { kind: 'checked'; fix: number; review: number };

/** A message key and its values; the page puts it into words. */
export type Line = { key: string; params: Record<string, string | number> };

/** `tone` is a class name; the words say the same, so colour is never the only sign. */
export type StatusLine = Line & { tone: 'fix' | 'review' | 'quiet' };

export function versionStatus(built: boolean, checks: ChecksFile | undefined): DraftStatus {
  if (!built) return { kind: 'notBuilt' };
  if (!checks) return { kind: 'notChecked' };
  return { kind: 'checked', fix: checks.summary.fix, review: checks.summary.review };
}

/** Something has to be done before the draft is any use: the gallery's "Needs attention". */
export function needsAttention(status: DraftStatus): boolean {
  if (status.kind === 'checked') return status.fix > 0;
  return status.kind !== 'notChecked';
}

export function statusLine(status: DraftStatus): StatusLine {
  switch (status.kind) {
    case 'unreadable':
      return { key: 'studio.status.unreadable', params: {}, tone: 'fix' };
    case 'notBuilt':
      return { key: 'studio.status.notBuilt', params: {}, tone: 'quiet' };
    case 'notChecked':
      return { key: 'studio.status.notChecked', params: {}, tone: 'quiet' };
    case 'checked':
      if (status.fix > 0) {
        return { key: 'studio.status.fix', params: { count: status.fix }, tone: 'fix' };
      }
      if (status.review > 0) {
        return { key: 'studio.status.review', params: { count: status.review }, tone: 'review' };
      }
      return { key: 'studio.status.good', params: {}, tone: 'quiet' };
  }
}

/**
 * How many rules of the book the full check ran and found nothing against (the Checks tab's
 * "passed"): the automatic rules of the checks that ran (the deep ones only after `--deep`), less
 * every rule with a finding, accepted or not. A rule that applies to other kinds of screen is
 * counted too, so this is the most the check can say passed, never a promise about the screen.
 */
export function passedCount(checks: ChecksFile): number {
  const found = new Set([...checks.findings, ...(checks.waived ?? [])].map((one) => one.rule));
  return GUIDELINES.filter((rule) => {
    if (rule.check === 'edit' || rule.check === 'options') return false;
    if (checks.checks[rule.check] !== 'ran') return false;
    const ran = rule.mode === 'auto' || (rule.mode === 'deep' && checks.deep === true);
    return ran && !found.has(rule.id);
  }).length;
}

/** The studio width a checked width shows at: the nearest one, a tie going to the wider. */
export function studioWidth(width: number): Width {
  let best: Width = WIDTHS[0];
  for (const candidate of WIDTHS) {
    if (Math.abs(candidate - width) <= Math.abs(best - width)) best = candidate;
  }
  return best;
}

/**
 * The studio widths a finding shows at: those it was seen at, or, when it was seen at none of
 * them (320, 1024, 1440), the nearest to each, so no finding is left without a place.
 */
function shownAt(widths: number[]): number[] {
  const own = widths.filter((width) => WIDTHS.some((studio) => studio === width));
  return own.length > 0 ? own : widths.map(studioWidth);
}

/** Findings seen in this state at this width, and those of files, which hold everywhere. */
export function findingsFor(
  checks: ChecksFile | undefined,
  state: string,
  width: number,
): { shown: Finding[]; elsewhere: number } {
  if (!checks) return { shown: [], elsewhere: 0 };
  const shown = sortFindings(checks.findings).filter(
    (finding) =>
      finding.states.length === 0 ||
      (finding.states.includes(state) && shownAt(finding.widths).includes(width)),
  );
  return { shown, elsewhere: checks.findings.length - shown.length };
}

/** `latest` is the draft's newest version: a new one comes after it. */
export function nextStep(status: DraftStatus, slug: string, latest: number): Line {
  switch (status.kind) {
    case 'unreadable':
    case 'notBuilt':
      return { key: 'studio.next.build', params: { slug } };
    case 'notChecked':
      return { key: 'studio.next.check', params: { slug } };
    case 'checked':
      if (status.fix > 0) return { key: 'studio.next.fix', params: { slug } };
      if (status.review > 0) return { key: 'studio.next.review', params: {} };
      return { key: 'studio.next.good', params: { next: latest + 1 } };
  }
}
