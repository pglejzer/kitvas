// The words of a live finding's row, with no page in them: its short name (a text key under
// `studio.edit.checks.name.`), the value its message quotes, and the one quiet line of where it was
// found (a file and line in the code, the widths in the page). The row's own message stays the
// title's tooltip. `view.ts` draws them.

import { type Evidence, evidenceName } from './evidence.ts';

/** A short name for each rule of a code finding that reaches the live list (`live-code.ts`). */
const RULE_NAMES: Readonly<Record<string, string>> = {
  'ds/raw-color': 'checks.name.rawColor',
  'ds/raw-size': 'checks.name.rawSize',
  'ds/unknown-token': 'checks.name.unknownToken',
  'ds/foreign-import': 'checks.name.foreignImport',
  'ds/style-import': 'checks.name.styleImport',
  'ds/not-in-catalog': 'checks.name.notInCatalog',
  'ds/raw-control': 'checks.name.rawControl',
  'ds/tailwind-arbitrary': 'checks.name.tailwindArbitrary',
  'ds/tailwind-unknown': 'checks.name.tailwindUnknown',
  'ui/transition-all': 'checks.name.transitionAll',
  'ui/image-size': 'checks.name.imageSize',
  'ui/clipped-text': 'checks.name.clipped',
};

/** The short name of a rule's findings, as a text key; `null` for a rule with none. */
export const ruleNameKey = (rule: string): string | null => RULE_NAMES[rule] ?? null;

/** The short name of a row: its evidence's when it has one, else its rule's; `null`: use its words. */
export function rowNameKey(row: { rule: string; evidence: Evidence }): string | null {
  return evidenceName(row.evidence) ?? ruleNameKey(row.rule);
}

const QUOTED = /"([^"]+)"/;
const TAG = /<([A-Za-z][A-Za-z0-9.]*)>/;

/** What a code finding's words quote: `"#fff"`, `"@kit"` or a plain `<button>`; `null` for none. */
export function quotedValue(message: string): string | null {
  const quoted = QUOTED.exec(message)?.[1]?.trim();
  if (quoted !== undefined && quoted !== '') return quoted;
  const tag = TAG.exec(message)?.[1];
  return tag === undefined ? null : `<${tag}>`;
}

const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(.+\))$/i;

/** Whether a value is a colour a swatch can show. */
export const isColourValue = (value: string): boolean => COLOUR.test(value.trim());

export type Say = (key: string, params?: Record<string, string | number>) => string;

/** One quiet line: "info.scss, line 4" in the code, "At 390, 1280 px" in the page, else "In the code". */
export function whereWords(
  row: { widths: readonly number[]; place?: { file: string; line: number } },
  say: Say,
): string {
  const { place } = row;
  if (place !== undefined) {
    return place.line > 0 ? say('live.place', { file: place.file, line: place.line }) : place.file;
  }
  if (row.widths.length === 0) return say('live.inCode');
  return say('live.at', { widths: row.widths.join(', ') });
}
