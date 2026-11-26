// The rule about a version's shared values (plan 26, ADR 0086). Pure: the app hands in the draft's
// TSX. `ux/shared-unused` (fix): a shared value that no section sets, so no control can change it,
// or that no section reads, so changing it shows nothing. Makers read a value only as
// `shared.<id>` (or `shared['<id>']`) and set it only with `setShared({ … })`, so those are the
// forms it looks for.

import { SHARED_FILE, type SharedValue } from '../../../shared/index.ts';
import type { RawFinding } from '../findings/finding.ts';
import { blanked } from '../options/options-rules.ts';

export const SHARED_UNUSED = 'ux/shared-unused';
/** The ids of the rules in this folder; each has an `auto` entry in the guideline book. */
export const SHARED_RULE_IDS: readonly string[] = [SHARED_UNUSED];

/** The entry and the generated type are not sections: they only pass the values along. */
const NOT_A_SECTION = /^(?:src\/tsx\/)?(?:index\.tsx|shared\.ts)$/;

/** The text of every `setShared({ … })` object, braces included, of one file. */
function setSharedObjects(code: string): string[] {
  const found: string[] = [];
  for (const call of code.matchAll(/\bsetShared\s*\(\s*\{/g)) {
    const start = call.index + call[0].length - 1;
    let depth = 0;
    for (let at = start; at < code.length; at += 1) {
      const char = code[at];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      if (depth === 0) {
        found.push(code.slice(start, at + 1));
        break;
      }
    }
  }
  return found;
}

const keyed = (object: string, id: string): boolean =>
  new RegExp(`[{,]\\s*(?:${id}|"${id}"|'${id}')\\s*[:,}]`).test(object);

const readIn = (code: string, id: string): boolean =>
  new RegExp(
    `(?<![A-Za-z0-9_$])shared(?:\\.${id}(?![A-Za-z0-9_$])|\\[\\s*(?:"${id}"|'${id}')\\s*\\])`,
  ).test(code);

const finding = (key: string, id: string): RawFinding => ({
  check: 'ux',
  rule: SHARED_UNUSED,
  severity: 'fix',
  file: SHARED_FILE,
  line: 0,
  column: 0,
  element: null,
  message: { key, params: { id } },
  hint: { key: 'checkHint.uxSharedUnused', params: {} },
  states: [],
  widths: [],
  options: [],
});

/** A finding for each shared value no section sets, and for each no section reads. */
export function sharedUnusedFindings(
  code: readonly { file: string; text: string }[],
  shared: readonly SharedValue[],
): RawFinding[] {
  if (shared.length === 0) return [];
  const sections = code
    .filter((one) => !NOT_A_SECTION.test(one.file))
    .map((one) => blanked(one.text));
  const objects = sections.flatMap(setSharedObjects);
  return shared.flatMap((value): RawFinding[] => [
    ...(objects.some((object) => keyed(object, value.id))
      ? []
      : [finding('checkRule.uxSharedUnused', value.id)]),
    ...(sections.some((text) => readIn(text, value.id))
      ? []
      : [finding('checkRule.uxSharedUnread', value.id)]),
  ]);
}
