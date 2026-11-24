import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IdEntry } from '../../src/checks/domain/ids.ts';
import {
  classRules,
  type LiveCodeInput,
  liveCodeFindings,
  MAX_LIVE_CODE,
} from '../../src/checks/domain/live-code.ts';

const TSX = 'src/tsx/sections/Hero.tsx';
const SCSS = 'src/scss/sections/hero.scss';
const HERO = 'sections/Hero:section';
const BUTTON = 'sections/Hero:section/button';

const SHEET = [
  '// .note { color: red; }',
  '.hero {',
  '  padding: 13px; /* off-kit */',
  '  @media (min-width: 768px) {',
  '    color: #f00; /* off-kit */',
  '  }',
  '  &:hover { color: var(--kit-color-nope); }',
  '}',
  '.other, .more {',
  '  margin: 13px; /* off-kit */',
  '}',
  '.cta { color: #00f; }',
].join('\n');

const CODE = [
  "import { Button } from '@kit';",
  "import dayjs from 'dayjs';",
  '',
  'export function Hero() {',
  '  return <section className="hero"><button type="button">Go</button></section>;',
  '}',
].join('\n');

const OTHER = 'src/tsx/sections/Other.tsx';

const ids: IdEntry[] = [
  { id: HERO, file: TSX, line: 5, column: 10, tag: 'section' },
  { id: BUTTON, file: TSX, line: 5, column: 37, tag: 'button' },
  { id: 'sections/Other:div/button', file: OTHER, line: 3, column: 5, tag: 'button' },
];

const input = (patch: Partial<LiveCodeInput> = {}): LiveCodeInput => ({
  files: [],
  catalog: [{ name: 'Button', category: 'action' }],
  tokens: new Set(['--kit-color-ink', '--kit-space-md']),
  sizes: [{ name: '--kit-space-md', value: 12, unit: 'px' }],
  ids,
  owners: [],
  ...patch,
});

test('the class rules of a sheet span their nested blocks; comments and lists are no rule', () => {
  assert.deepEqual(classRules(SHEET), [
    { className: 'hero', from: 2, to: 8 },
    { className: 'cta', from: 12, to: 12 },
  ]);
});

test('a written sheet gives its raw values and unknown tokens, on the element of its class', () => {
  const owners = [{ className: 'hero', element: HERO }];
  const findings = liveCodeFindings(input({ files: [{ file: SCSS, text: SHEET }], owners }));
  assert.deepEqual(
    findings.map((finding) => [finding.rule, finding.severity, finding.line, finding.element]),
    [
      ['ds/raw-size', 'review', 3, HERO],
      ['ds/raw-color', 'fix', 5, HERO],
      ['ds/unknown-token', 'fix', 7, HERO],
      ['ds/raw-size', 'review', 10, null],
      ['ds/raw-color', 'fix', 12, null],
    ],
  );
  assert.ok(findings.every((finding) => finding.file === SCSS && finding.check === 'ds'));
});

test('a written TSX file gives its imports and the plain controls of that file only', () => {
  const findings = liveCodeFindings(input({ files: [{ file: TSX, text: CODE }] }));
  assert.deepEqual(
    findings.map((finding) => [finding.rule, finding.file, finding.element]),
    [
      ['ds/foreign-import', TSX, null],
      ['ds/raw-control', TSX, BUTTON],
    ],
  );
});

test('the generated entry sheet and files of no kind are left out, and the answer has a cap', () => {
  const entry = { file: 'src/scss/index.scss', text: '.a { color: #000; }' };
  const layout = { file: 'md/layout.md', text: 'color: #000;' };
  assert.deepEqual(liveCodeFindings(input({ files: [entry, layout] })), []);
  const rule = (index: number): string => `.x${index} { color: #000; }`;
  const many = Array.from({ length: MAX_LIVE_CODE + 20 }, (_, index) => rule(index)).join('\n');
  const findings = liveCodeFindings(input({ files: [{ file: SCSS, text: many }] }));
  assert.equal(findings.length, MAX_LIVE_CODE);
});
