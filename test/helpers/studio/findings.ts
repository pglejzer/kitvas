// Findings and checks.json contents for tests of what the studio shows.

import { type ChecksFile, type Finding, summarize } from '../../../src/checks/index.ts';

export function finding(over: Partial<Finding> = {}): Finding {
  return {
    check: 'a11y',
    rule: 'a11y/label',
    severity: 'fix',
    file: 'src/tsx/Draft.tsx',
    line: 12,
    column: 3,
    element: 'Draft:main/Input.0',
    message: 'The phone field has no label.',
    hint: 'Give the Input a label.',
    states: [],
    widths: [],
    ...over,
  };
}

/** checks.json of `shop` version 1 with these findings, unless `over` says otherwise. */
export function checksOf(findings: Finding[], over: Partial<ChecksFile> = {}): ChecksFile {
  return {
    schemaVersion: 1,
    slug: 'shop',
    version: 1,
    checks: {
      build: 'ran',
      types: 'ran',
      ds: 'ran',
      a11y: 'ran',
      ui: 'ran',
      ux: 'ran',
      runtime: 'ran',
    },
    summary: summarize(findings),
    browser: 'chrome',
    notes: [],
    shots: [],
    findings,
    ...over,
  };
}
