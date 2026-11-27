// The rule about a version's shared values (plan 26, ADR 0086). Pure: the app hands in the draft's
// TSX. `ux/shared-unused` (fix): a shared value that no section sets, so no control can change it,
// or that no section reads, so changing it shows nothing. A value is read as `shared.<id>`,
// `shared['<id>']` or `const { <id> } = shared`, and set with `setShared({ … })`: those are the
// forms it looks for. `sharedUses` says which files set and read each value: the rule and the code
// hand-off's brief (ADR 0088) both take it from there.

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

const reads = (code: string, id: string): boolean =>
  new RegExp(
    `(?<![A-Za-z0-9_$])shared(?:\\.${id}(?![A-Za-z0-9_$])|\\[\\s*(?:"${id}"|'${id}')\\s*\\])`,
  ).test(code);

/** The names a file takes out of `shared` with `const { a, b: c, d = 'x' } = shared`. */
function destructured(code: string): Set<string> {
  const names = new Set<string>();
  for (const match of code.matchAll(/\{([^{}]*)\}\s*(?::[^=;{}]+)?=\s*shared(?![A-Za-z0-9_$])/g)) {
    for (const part of (match[1] ?? '').split(',')) {
      const name = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(part)?.[1];
      if (name !== undefined) names.add(name);
    }
  }
  return names;
}

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

/** A shared value with the files that set it and the files that read it, in the order given. */
export type SharedUse = SharedValue & { setIn: string[]; readIn: string[] };

/** Where each shared value is set and read. The generated entry and type are not looked at. */
export function sharedUses(
  code: readonly { file: string; text: string }[],
  shared: readonly SharedValue[],
): SharedUse[] {
  const sections = code
    .filter((one) => !NOT_A_SECTION.test(one.file))
    .map((one) => {
      const text = blanked(one.text);
      return { file: one.file, text, objects: setSharedObjects(text), names: destructured(text) };
    });
  return shared.map((value) => ({
    ...value,
    setIn: sections
      .filter((one) => one.objects.some((object) => keyed(object, value.id)))
      .map((one) => one.file),
    readIn: sections
      .filter((one) => one.names.has(value.id) || reads(one.text, value.id))
      .map((one) => one.file),
  }));
}

/** A finding for each shared value no section sets, and for each no section reads. */
export function sharedUnusedFindings(
  code: readonly { file: string; text: string }[],
  shared: readonly SharedValue[],
): RawFinding[] {
  return sharedUses(code, shared).flatMap((use): RawFinding[] => [
    ...(use.setIn.length > 0 ? [] : [finding('checkRule.uxSharedUnused', use.id)]),
    ...(use.readIn.length > 0 ? [] : [finding('checkRule.uxSharedUnread', use.id)]),
  ]);
}
