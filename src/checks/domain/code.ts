// The ds check of a draft's code: imports come from the kit, controls are the kit's components.

import type { RawFinding } from './finding.ts';
import type { IdEntry } from './ids.ts';

export type ImportInput = {
  /** Path inside the draft version: `src/tsx/sections/Hero.tsx`. */
  file: string;
  text: string;
  /** Names of the kit's catalog components. */
  components: ReadonlySet<string>;
};

export type ControlInput = { ids: IdEntry[]; catalog: { name: string; category: string }[] };

/** `import [type] [clause from] 'source'` at the start of a line. */
const IMPORT = /^[ \t]*import\s+(type\s+)?(?:([\w$*{}\s,]+?)\s+from\s+)?['"]([^'"]+)['"]/gm;

/** Plain elements that a kit component of the category replaces. */
const CONTROLS: Record<string, string> = {
  button: 'action',
  input: 'input',
  select: 'input',
  textarea: 'input',
  dialog: 'overlay',
};

const allowed = (source: string): boolean =>
  source === '@kit' || source === 'react' || source.startsWith('./') || source.startsWith('../');

function placeOf(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

function dsFinding(
  file: string,
  place: { line: number; column: number },
  rule: string,
  severity: RawFinding['severity'],
  message: RawFinding['message'],
  hint: string,
  element: string | null = null,
): RawFinding {
  return {
    check: 'ds',
    rule,
    severity,
    file,
    line: place.line,
    column: place.column,
    element,
    message,
    hint: { key: hint, params: {} },
    states: [],
    widths: [],
  };
}

export function importFindings({ file, text, components }: ImportInput): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const match of text.matchAll(IMPORT)) {
    const source = match[3] ?? '';
    const start = match.index ?? 0;
    if (!allowed(source)) {
      findings.push(
        dsFinding(
          file,
          placeOf(text, start + match[0].indexOf('import')),
          'ds/foreign-import',
          'fix',
          { key: 'checkRule.foreignImport', params: { source } },
          'checkHint.foreignImport',
        ),
      );
      continue;
    }
    const clause = match[2] ?? '';
    if (source !== '@kit' || match[1] || !clause) continue;
    const braces = /\{([^}]*)\}/.exec(clause);
    if (!braces) continue;
    let offset = start + match[0].indexOf(clause) + braces.index + 1;
    for (const part of (braces[1] ?? '').split(',')) {
      const spec = part.trim();
      const at = offset + part.indexOf(spec);
      offset += part.length + 1;
      if (!spec || spec.startsWith('type ')) continue;
      const name = spec.split(/\s+as\s+/)[0] ?? '';
      if (components.has(name)) continue;
      findings.push(
        dsFinding(
          file,
          placeOf(text, at),
          'ds/not-in-catalog',
          'fix',
          { key: 'checkRule.notInCatalog', params: { name } },
          'checkHint.notInCatalog',
        ),
      );
    }
  }
  return findings;
}

export function rawControlFindings({ ids, catalog }: ControlInput): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const entry of ids) {
    const category = Object.hasOwn(CONTROLS, entry.tag) ? CONTROLS[entry.tag] : undefined;
    if (!category) continue;
    const components = catalog
      .filter((component) => component.category === category)
      .map((component) => component.name);
    if (components.length === 0) continue;
    findings.push(
      dsFinding(
        entry.file,
        { line: entry.line, column: entry.column },
        'ds/raw-control',
        'review',
        {
          key: 'checkRule.rawControl',
          params: { tag: entry.tag, components: components.join(', ') },
        },
        'checkHint.rawControl',
        entry.id,
      ),
    );
  }
  return findings;
}
