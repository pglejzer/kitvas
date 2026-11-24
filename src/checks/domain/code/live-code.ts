// Live checks on the server (spec 4c, goal 5; plan 16, task C): the code findings of the files one
// edit wrote, by the ds check's own rules (`code.ts`, `styles.ts`): imports, plain controls, raw
// colours and sizes, unknown tokens. They need no browser, so the edit's answer carries them. A
// finding in a style sheet belongs to the element a style edit named when it sits in that
// element's class rule. Pure: the caller reads the files, the kit and the element ids.

import type { RawFinding } from '../findings/finding.ts';
import { importFindings, rawControlFindings } from './code.ts';
import type { IdEntry } from './ids.ts';
import { sourceRuleFindings } from './source-rules.ts';
import { codeLines, type SizeToken, styleFindings } from './styles.ts';
import { elementAt } from './tsc.ts';

/** One answer carries at most this many: a whole file of raw values stays readable. */
export const MAX_LIVE_CODE = 100;

const TSX = /^src\/tsx\/.+\.tsx$/;
const SCSS = /^src\/scss\/.+\.scss$/;
/** Generated from the layout; it only lists the section sheets. */
const ENTRY_SHEET = 'src/scss/index.scss';
const CLASS_SELECTOR = /^\s*\.([A-Za-z_][\w-]*)\s*$/;

export type LiveCodeInput = {
  /** The files the edit wrote: paths inside the version, with their text now. */
  files: readonly { file: string; text: string }[];
  /** The kit's catalog. */
  catalog: readonly { name: string; category: string }[];
  /** Every `--kit-*` name of the kit. */
  tokens: ReadonlySet<string>;
  /** The kit's dimension tokens. */
  sizes: readonly SizeToken[];
  /** Where the elements of the written TSX files are now. */
  ids: readonly IdEntry[];
  /** Each class a style edit wrote, with the element it wrote it for. */
  owners: readonly { className: string; element: string }[];
};

/** A top-level rule of one class, `.name { … }`, by its first and last line (1-based). */
export type ClassRule = { className: string; from: number; to: number };

/**
 * The top-level rules of a sheet whose selector is one class. Comments and strings do not count
 * (`codeLines`); nested blocks (`&:hover`, `@media`) are inside their rule.
 */
export function classRules(text: string): ClassRule[] {
  const rules: ClassRule[] = [];
  let depth = 0;
  let selector = '';
  let open: { className: string; from: number } | null = null;
  for (const [index, line] of codeLines(text).entries()) {
    for (const char of line) {
      if (char === '{') {
        if (depth === 0) {
          const match = CLASS_SELECTOR.exec(selector);
          open = match ? { className: match[1] ?? '', from: index + 1 } : null;
        }
        depth += 1;
        selector = '';
      } else if (char === '}') {
        depth = Math.max(0, depth - 1);
        selector = '';
        if (depth === 0 && open) {
          rules.push({ ...open, to: index + 1 });
          open = null;
        }
      } else if (depth === 0) {
        selector = char === ';' ? '' : selector + char;
      }
    }
    if (depth === 0) selector += ' ';
  }
  return rules;
}

/** The element whose class rule holds `line`, when a style edit named one. */
function ownerAt(
  rules: readonly ClassRule[],
  owners: LiveCodeInput['owners'],
  line: number,
): string | null {
  const rule = rules.find((one) => line >= one.from && line <= one.to);
  if (!rule) return null;
  return owners.find((owner) => owner.className === rule.className)?.element ?? null;
}

/**
 * Import, source-rule and style findings in file order, then plain controls; at most
 * `MAX_LIVE_CODE`. A TSX finding gets the element written at its place, as the full check does.
 */
export function liveCodeFindings(input: LiveCodeInput): RawFinding[] {
  const components = new Set(input.catalog.map((component) => component.name));
  const findings: RawFinding[] = [];
  const written = new Set<string>();
  const all = [...input.ids];
  for (const { file, text } of input.files) {
    if (TSX.test(file)) {
      written.add(file);
      findings.push(...importFindings({ file, text, components }));
      for (const finding of sourceRuleFindings({ file, text })) {
        findings.push({ ...finding, element: elementAt(all, file, finding.line, finding.column) });
      }
      continue;
    }
    if (!SCSS.test(file) || file === ENTRY_SHEET) continue;
    const rules = classRules(text);
    const sizes = [...input.sizes];
    const sheet = [
      ...sourceRuleFindings({ file, text }),
      ...styleFindings({ file, text, tokens: input.tokens, sizes }),
    ];
    for (const finding of sheet.sort((a, b) => a.line - b.line)) {
      findings.push({ ...finding, element: ownerAt(rules, input.owners, finding.line) });
    }
  }
  const ids = all.filter((entry) => written.has(entry.file));
  findings.push(...rawControlFindings({ ids, catalog: [...input.catalog] }));
  return findings.slice(0, MAX_LIVE_CODE);
}
