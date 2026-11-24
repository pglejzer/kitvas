import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  codeLines,
  type SizeToken,
  styleFindings,
} from '../../../src/checks/domain/code/styles.ts';

const TOKENS = new Set(['--kit-color-ink', '--kit-space-sm', '--kit-space-none']);
const SIZES: SizeToken[] = [
  { name: '--kit-space-sm', value: 8, unit: 'px' },
  { name: '--kit-space-none', value: 0, unit: 'px' },
];
const FILE = 'src/scss/sections/hero.scss';

const SHEET = [
  '// Hero styles: #000 in a comment is fine',
  '.hero {',
  '  color: #fff;',
  '  background: rgb(0 0 0 / 50%);',
  '  border-color: White;',
  '  padding: 8px var(--kit-space-sm);',
  '  margin: 10px 0;',
  '  gap: 0.5rem;',
  '  border-radius: 3px;',
  '  font-family: "Red Hat", sans-serif;',
  '  animation: pulse-red 1s;',
  '  width: 12px;',
  '  outline: 1px solid var(--kit-color-nope, #f00);',
  '  /* color: blue; */',
  '  &:hover { color: var(--kit-color-ink); }',
  '  $accent: tomato;',
  '}',
].join('\r\n');

test('comments, strings and url() contents become spaces; columns stay', () => {
  assert.deepEqual(codeLines('a: "x" b; // c\n/* d\ne */ f: url(g.png);'), [
    'a:     b;     ',
    '    ',
    '     f:           ;',
  ]);
});

test('raw colours, unknown tokens and sizes off the scale are found where they are', () => {
  const findings = styleFindings({ file: FILE, text: SHEET, tokens: TOKENS, sizes: SIZES });
  assert.deepEqual(
    findings.map((finding) => [
      finding.rule,
      finding.severity,
      finding.line,
      finding.column,
      finding.message.params,
    ]),
    [
      ['ds/raw-color', 'fix', 3, 10, { value: '#fff' }],
      ['ds/raw-color', 'fix', 4, 15, { value: 'rgb(0 0 0 / 50%)' }],
      ['ds/raw-color', 'fix', 5, 17, { value: 'White' }],
      ['ds/raw-size', 'fix', 6, 12, { value: '8px', token: '--kit-space-sm' }],
      ['ds/raw-size', 'review', 7, 11, { value: '10px', token: '--kit-space-sm' }],
      ['ds/raw-size', 'fix', 8, 8, { value: '0.5rem', token: '--kit-space-sm' }],
      ['ds/unknown-token', 'fix', 13, 26, { name: '--kit-color-nope' }],
      ['ds/raw-color', 'fix', 16, 12, { value: 'tomato' }],
    ],
  );
  assert.deepEqual(findings[0], {
    check: 'ds',
    rule: 'ds/raw-color',
    severity: 'fix',
    file: FILE,
    line: 3,
    column: 10,
    element: null,
    message: { key: 'checkRule.rawColor', params: { value: '#fff' } },
    hint: { key: 'checkHint.rawColor', params: {} },
    states: [],
    widths: [],
  });
  assert.deepEqual(
    [findings[3]?.message.key, findings[3]?.hint],
    ['checkRule.tokenValue', { key: 'checkHint.tokenValue', params: { token: '--kit-space-sm' } }],
  );
  assert.deepEqual(
    [findings[4]?.message.key, findings[4]?.hint],
    ['checkRule.offScale', { key: 'checkHint.offScale', params: { token: '--kit-space-sm' } }],
  );
});

test('without size tokens of a kind there is nothing to compare sizes with', () => {
  const text = '.a {\n  margin: 10px;\n  font-size: 13px;\n}\n';
  assert.deepEqual(styleFindings({ file: FILE, text, tokens: TOKENS, sizes: [] }), []);
  assert.deepEqual(styleFindings({ file: FILE, text, tokens: TOKENS, sizes: SIZES }).length, 1);
});
