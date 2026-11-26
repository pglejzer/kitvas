import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Finding,
  mergeFindings,
  type RawFinding,
  sortFindings,
  summarize,
  toolText,
  translateFinding,
} from '../../../src/checks/domain/findings/finding.ts';

const raw = (change: Partial<RawFinding> = {}): RawFinding => ({
  check: 'ds',
  rule: 'ds/raw-color',
  severity: 'fix',
  file: 'src/scss/sections/hero.scss',
  line: 2,
  column: 10,
  element: null,
  message: { key: 'checkRule.rawColor', params: { value: '#fff' } },
  hint: { key: 'checkHint.rawColor', params: {} },
  states: [],
  widths: [],
  ...change,
});

const t = (key: string, params: Record<string, string | number> = {}): string =>
  `${key} ${JSON.stringify(params)}`;
const words = (change: Partial<RawFinding> = {}): Finding => translateFinding(raw(change), t);

test('a finding is put into words; tool text is passed on', () => {
  assert.deepEqual(words(), {
    ...raw(),
    options: [],
    message: 'checkRule.rawColor {"value":"#fff"}',
    hint: 'checkHint.rawColor {}',
  });
  assert.deepEqual(toolText('Expected ";"'), {
    key: 'checkRule.tool',
    params: { text: 'Expected ";"' },
  });
});

test('the same finding seen in other states and widths is listed once', () => {
  const merged = mergeFindings([
    words({ states: ['filled'], widths: [390] }),
    words({ states: ['filled'], widths: [1280] }),
    words({ states: ['empty'], widths: [390] }),
    words({ element: 'sections/Hero:section', states: ['filled'], widths: [390] }),
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0]?.states, ['filled', 'empty']);
  assert.deepEqual(merged[0]?.widths, [390, 1280]);
  assert.deepEqual(merged[1]?.element, 'sections/Hero:section');
});

test('fix comes before review, then check, file, line and column', () => {
  const sorted = sortFindings([
    words({ severity: 'review', line: 1 }),
    words({ line: 9 }),
    words({ file: 'src/scss/a.scss', line: 20 }),
    words({ check: 'types', rule: 'types/TS2322', file: 'src/tsx/index.tsx' }),
    words({ line: 9, column: 2 }),
    words({ check: 'build', rule: 'build/bundle', file: null, line: 0, column: 0 }),
  ]);
  assert.deepEqual(
    sorted.map((finding) => [
      finding.severity,
      finding.check,
      finding.file,
      finding.line,
      finding.column,
    ]),
    [
      ['fix', 'build', null, 0, 0],
      ['fix', 'types', 'src/tsx/index.tsx', 2, 10],
      ['fix', 'ds', 'src/scss/a.scss', 20, 10],
      ['fix', 'ds', 'src/scss/sections/hero.scss', 9, 2],
      ['fix', 'ds', 'src/scss/sections/hero.scss', 9, 10],
      ['review', 'ds', 'src/scss/sections/hero.scss', 1, 10],
    ],
  );
  assert.deepEqual(summarize(sorted), { fix: 5, review: 1 });
});
