// Findings: what the checks report about a draft, and the file they are saved in.

import type { Translate } from '../../shared/index.ts';

export const CHECKS = ['build', 'types', 'ds', 'a11y', 'runtime'] as const;
export type CheckName = (typeof CHECKS)[number];
export type Severity = 'fix' | 'review';
export type Message = { key: string; params: Record<string, string | number> };

/** What a rule found, before its message is put into words. */
export type RawFinding = {
  check: CheckName;
  /** `<check>/<name>`: `ds/raw-color`, `types/TS2322`. */
  rule: string;
  severity: Severity;
  /** Path inside the draft version with forward slashes; null when the finding has no place. */
  file: string | null;
  /** 1-based; 0 when unknown. */
  line: number;
  column: number;
  /** Element id from build/json/ids.json. */
  element: string | null;
  message: Message;
  hint: Message;
  /** Browser checks: the states and widths it was seen in. Empty for checks that read files. */
  states: string[];
  widths: number[];
};

export type Finding = Omit<RawFinding, 'message' | 'hint'> & { message: string; hint: string };

/** A full-page screenshot, relative to the draft version: `build/shots/filled-390.png`. */
export type Shot = { state: string; width: number; file: string };

export type ChecksFile = {
  schemaVersion: 1;
  slug: string;
  version: number;
  /** A check is skipped when what it needs is missing or comes in a later version of kitvas. */
  checks: Record<CheckName, 'ran' | 'skipped'>;
  summary: { fix: number; review: number };
  /** The browser the page checks ran in; null when they did not run. */
  browser: string | null;
  /** Why checks did not run, in words. */
  notes: string[];
  shots: Shot[];
  findings: Finding[];
};

/** Text written by a tool (esbuild, Sass, tsc) is passed on as it is. */
export const toolText = (text: string): Message => ({ key: 'checkRule.tool', params: { text } });

export const translateFinding = (raw: RawFinding, t: Translate): Finding => ({
  ...raw,
  message: t(raw.message.key, raw.message.params),
  hint: t(raw.hint.key, raw.hint.params),
});

const placeKey = (finding: Finding): string =>
  JSON.stringify([
    finding.check,
    finding.rule,
    finding.file,
    finding.line,
    finding.column,
    finding.element,
    finding.message,
  ]);

/** One finding per rule, place and message; the states and widths of the others are joined. */
export function mergeFindings(findings: Finding[]): Finding[] {
  const merged = new Map<string, Finding>();
  for (const finding of findings) {
    const key = placeKey(finding);
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, { ...finding, states: [...finding.states], widths: [...finding.widths] });
      continue;
    }
    for (const state of finding.states) if (!seen.states.includes(state)) seen.states.push(state);
    for (const width of finding.widths) if (!seen.widths.includes(width)) seen.widths.push(width);
  }
  return [...merged.values()];
}

const SEVERITY_ORDER: Record<Severity, number> = { fix: 0, review: 1 };
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `fix` before `review`, then by check, file, line and column. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      CHECKS.indexOf(a.check) - CHECKS.indexOf(b.check) ||
      compareText(a.file ?? '', b.file ?? '') ||
      a.line - b.line ||
      a.column - b.column,
  );
}

export const summarize = (findings: Finding[]): { fix: number; review: number } => ({
  fix: findings.filter((finding) => finding.severity === 'fix').length,
  review: findings.filter((finding) => finding.severity === 'review').length,
});
