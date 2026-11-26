// The two rules about a version's options (plan 25, C7). Pure: the app hands in what it measured.
// `options/no-effect` (review): a value whose page looks the same as the default combination's at
// both main widths, so it changes nothing the person can see. `options/unknown` (fix): a
// `data-opt-` selector in the draft's SCSS that names an option or a value the options file does
// not declare, so the rule can never match. Both are filed under the check that found them: the
// first under `ui` (a page measure), the second under `ds` (a source rule).

import type { DraftOption } from '../../../shared/index.ts';
import { placeOf } from '../code/source-rules.ts';
import type { RawFinding } from '../findings/finding.ts';
import { VIEWPORTS } from '../page/page.ts';

export const OPTION_NO_EFFECT = 'options/no-effect';
export const OPTION_UNKNOWN = 'options/unknown';
/** The ids of the rules in this folder; each has an `auto` entry in the guideline book. */
export const OPTION_RULE_IDS: readonly string[] = [OPTION_NO_EFFECT, OPTION_UNKNOWN];

/** Where the options of a version are written, inside the version. */
export const OPTIONS_FILE = 'src/json/options.json';

/** One value's shot at one main width held against the default combination's shot there. */
export type ShotMatch = { id: string; value: string; width: number; same: boolean };

/**
 * A finding for each value whose shots equal the default combination's at every main width. A
 * value with a shot missing at some width (no browser, a failed visit) is left alone: the rule
 * says nothing it cannot prove.
 */
export function noEffectFindings(baseline: string, matches: readonly ShotMatch[]): RawFinding[] {
  const values = new Map<string, ShotMatch[]>();
  for (const match of matches) {
    const key = `${match.id}=${match.value}`;
    values.set(key, [...(values.get(key) ?? []), match]);
  }
  return [...values.values()].flatMap((own): RawFinding[] => {
    const [first] = own;
    if (first === undefined || own.length < VIEWPORTS.length || !own.every((one) => one.same)) {
      return [];
    }
    const { id, value } = first;
    return [
      {
        check: 'ui',
        rule: OPTION_NO_EFFECT,
        severity: 'review',
        file: OPTIONS_FILE,
        line: 0,
        column: 0,
        element: null,
        message: { key: 'checkRule.optionsNoEffect', params: { option: id, value } },
        hint: { key: 'checkHint.optionsNoEffect', params: {} },
        states: [baseline],
        widths: own.map((one) => one.width).sort((a, b) => a - b),
        options: [{ id, value }],
      },
    ];
  });
}

/** Comments as spaces, newlines kept, so a place in the text stays the place in the file. */
export const blanked = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '));

const SELECTOR =
  /\[\s*data-opt-([A-Za-z0-9_-]+)\s*(?:[~|^$*]?=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*[is]?\s*\]/g;

/** Every `data-opt-` attribute selector of the style sheets that the options file does not declare. */
export function unknownOptionFindings(
  sheets: readonly { file: string; text: string }[],
  options: readonly DraftOption[],
): RawFinding[] {
  const found: RawFinding[] = [];
  for (const { file, text } of sheets) {
    const code = blanked(text);
    for (const match of code.matchAll(SELECTOR)) {
      const option = options.find((one) => one.id === match[1]);
      const value = match[2] ?? match[3] ?? match[4];
      const known =
        option !== undefined &&
        (value === undefined || option.values.some((one) => one.id === value));
      if (known) continue;
      const place = placeOf(code, match.index);
      found.push({
        check: 'ds',
        rule: OPTION_UNKNOWN,
        severity: 'fix',
        file,
        line: place.line,
        column: place.column,
        element: null,
        message: { key: 'checkRule.optionsUnknown', params: { selector: match[0] } },
        hint: { key: 'checkHint.optionsUnknown', params: {} },
        states: [],
        widths: [],
        options: [],
      });
    }
  }
  return found;
}
