import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importFindings, rawControlFindings } from '../../../src/checks/domain/code/code.ts';
import type { IdEntry } from '../../../src/checks/domain/code/ids.ts';

const FILE = 'src/tsx/sections/Hero.tsx';

const CODE = [
  "import { Button, Card as Box, type ButtonProps, ICON_PATHS } from '@kit';",
  "import type { Thing } from '@kit';",
  "import { useState } from 'react';",
  "import { Row } from './Row.tsx';",
  'import {',
  '  Icon,',
  '  Table,',
  "} from '@kit';",
  "import dayjs from 'dayjs';",
  "import 'normalize.css';",
  "// import { Nope } from 'nope';",
  "import '../../scss/sections/hero.scss';",
  "import styles from './hero.module.css';",
].join('\n');

test('imports come from the kit, React or the draft; kit names are catalog components', () => {
  const findings = importFindings({
    file: FILE,
    text: CODE,
    components: new Set(['Button', 'Card', 'Icon']),
  });
  assert.deepEqual(
    findings.map((finding) => [
      finding.rule,
      finding.severity,
      finding.line,
      finding.column,
      finding.message.params,
    ]),
    [
      ['ds/not-in-catalog', 'fix', 1, 49, { name: 'ICON_PATHS' }],
      ['ds/not-in-catalog', 'fix', 7, 3, { name: 'Table' }],
      ['ds/foreign-import', 'fix', 9, 1, { source: 'dayjs' }],
      ['ds/foreign-import', 'fix', 10, 1, { source: 'normalize.css' }],
      ['ds/style-import', 'fix', 12, 1, { source: '../../scss/sections/hero.scss' }],
      ['ds/style-import', 'fix', 13, 1, { source: './hero.module.css' }],
    ],
  );
  assert.deepEqual(findings[4]?.message, {
    key: 'checkRule.styleImport',
    params: { source: '../../scss/sections/hero.scss' },
  });
  assert.deepEqual(findings[4]?.hint, { key: 'checkHint.styleImport', params: {} });
  assert.deepEqual(findings[2]?.message, {
    key: 'checkRule.foreignImport',
    params: { source: 'dayjs' },
  });
  assert.deepEqual(findings[2]?.hint, { key: 'checkHint.foreignImport', params: {} });
  assert.equal(findings[0]?.message.key, 'checkRule.notInCatalog');
});

const entry = (id: string, tag: string, line: number): IdEntry => ({
  id,
  file: FILE,
  line,
  column: 7,
  tag,
});
const IDS = [
  entry('sections/Hero:section', 'section', 5),
  entry('sections/Hero:section/button', 'button', 9),
  entry('sections/Hero:section/input', 'input', 10),
  entry('sections/Hero:section/dialog', 'dialog', 11),
];

test('a plain control is to review when the kit has a component for it', () => {
  const findings = rawControlFindings({
    ids: IDS,
    catalog: [
      { name: 'Button', category: 'action' },
      { name: 'Link', category: 'action' },
      { name: 'Icon', category: 'display' },
    ],
  });
  assert.deepEqual(findings, [
    {
      check: 'ds',
      rule: 'ds/raw-control',
      severity: 'review',
      file: FILE,
      line: 9,
      column: 7,
      element: 'sections/Hero:section/button',
      message: {
        key: 'checkRule.rawControl',
        params: { tag: 'button', components: 'Button, Link' },
      },
      hint: { key: 'checkHint.rawControl', params: {} },
      states: [],
      widths: [],
    },
  ]);
});
