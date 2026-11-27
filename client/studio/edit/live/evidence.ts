// The evidence a finding carries (plan 18, task D; spec goal 6, Checks): what was measured, so a
// finding's card shows the number against its limit instead of a sentence about it. A contrast
// ratio and the ratio it needs, a target's size, a box too narrow, a value the build shows where
// the editor showed another, a value and the nearest token, a heading level; for anything else,
// the finding's own message. Pure: the view words it (`view.ts`).

import { MIN_TARGET } from '../../../../src/shared/values/colour.ts';

/** What a finding measured, by name (`LiveFact['values']`). */
export type Values = Readonly<Record<string, string | number>>;

export type Evidence =
  | { kind: 'contrast'; ratio: number; needed: number }
  | { kind: 'target'; width: number; height: number; min: number }
  | { kind: 'overflow'; content: number; width: number }
  | { kind: 'mismatch'; property: string; expected: string; actual: string }
  | { kind: 'token'; value: string; token: string }
  | { kind: 'heading'; level: number }
  | { kind: 'message'; message: string };

/** A value as a number: a number, or a string that is one; `null` for anything else. */
export function numberOf(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const read = Number(value);
  return Number.isFinite(read) ? read : null;
}

const wordOf = (value: string | number | undefined): string | null =>
  value === undefined || String(value).trim() === '' ? null : String(value);

/**
 * The evidence of a finding from what it measured. Read by the values it has, not by its rule, so
 * a rule of the full check that one day carries the same values shows them the same way.
 */
export function evidenceOf(finding: { message: string; values: Values | null }): Evidence {
  const values = finding.values ?? {};
  const ratio = numberOf(values.ratio);
  const needed = numberOf(values.needed);
  if (ratio !== null && needed !== null) return { kind: 'contrast', ratio, needed };
  const width = numberOf(values.width);
  const height = numberOf(values.height);
  if (width !== null && height !== null) {
    return { kind: 'target', width, height, min: MIN_TARGET };
  }
  const content = numberOf(values.content);
  if (content !== null && width !== null) return { kind: 'overflow', content, width };
  const property = wordOf(values.property);
  const expected = wordOf(values.expected);
  const actual = wordOf(values.actual);
  if (property !== null && expected !== null && actual !== null) {
    return { kind: 'mismatch', property, expected, actual };
  }
  const value = wordOf(values.value);
  const token = wordOf(values.token ?? values.nearest);
  if (value !== null && token !== null) return { kind: 'token', value, token };
  const level = numberOf(values.level);
  if (level !== null && Number.isInteger(level) && level >= 1 && level <= 6) {
    return { kind: 'heading', level };
  }
  return { kind: 'message', message: finding.message };
}

/**
 * The finding's short name, a text key under `studio.edit.`, when the evidence says the rest; a
 * finding shown by its message is named by its message.
 */
export function evidenceName(evidence: Evidence): string | null {
  return evidence.kind === 'message' ? null : `checks.name.${evidence.kind}`;
}

/** A ratio as the evidence line shows it: at most two decimals, no trailing zeros. */
export const ratioWords = (ratio: number): string => String(Math.round(ratio * 100) / 100);
