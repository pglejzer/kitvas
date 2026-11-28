import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  sheetClasses,
  tailwindFindings,
  tailwindUnknown,
} from '../../../src/checks/domain/code/tailwind.ts';

const FILE = 'src/tsx/sections/Hero.tsx';
/** The `$` of a template's `${…}`, kept out of this file's own plain strings. */
const DOLLAR = '$';

const CODE = [
  "import { Button } from '@kit';",
  '',
  'export function Hero({ state }: { state: string }) {',
  "  const tone = state === 'empty' ? 'text-[#777]' : 'text-ink';",
  '  return (',
  '    <section className="hero p-[13px] md:bg-[#fff]">',
  "      <h1 className={'text-[rgb(0,0,0)] bg-nope'}>Shop</h1>",
  `      <p className={\`w-[42%] ${DOLLAR}{state} m-4\`}>Don't wait</p>`,
  "      <Button contentClassName={cn('[color:oklch(0.5_0.1_200)]', state && 'bg-nope')}>",
  '        Buy {tone}',
  '      </Button>',
  '    </section>',
  '  );',
  '}',
].join('\n');

test('arbitrary values and classes without CSS are found in class strings only', () => {
  const findings = tailwindFindings({
    file: FILE,
    text: CODE,
    unknown: ['bg-nope', 'text-ink', 'p-[13px]'],
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
      ['ds/tailwind-arbitrary', 'review', 6, 30, { value: 'p-[13px]' }],
      ['ds/tailwind-arbitrary', 'fix', 6, 39, { value: 'md:bg-[#fff]' }],
      ['ds/tailwind-arbitrary', 'fix', 7, 23, { value: 'text-[rgb(0,0,0)]' }],
      ['ds/tailwind-unknown', 'review', 7, 41, { name: 'bg-nope' }],
      ['ds/tailwind-arbitrary', 'review', 8, 22, { value: 'w-[42%]' }],
      ['ds/tailwind-arbitrary', 'fix', 9, 37, { value: '[color:oklch(0.5_0.1_200)]' }],
      ['ds/tailwind-unknown', 'review', 9, 76, { name: 'bg-nope' }],
    ],
  );
  assert.deepEqual(findings[1], {
    check: 'ds',
    rule: 'ds/tailwind-arbitrary',
    severity: 'fix',
    file: FILE,
    line: 6,
    column: 39,
    element: null,
    message: { key: 'checkRule.tailwindArbitrary', params: { value: 'md:bg-[#fff]' } },
    hint: { key: 'checkHint.tailwindArbitrary', params: {} },
    states: [],
    widths: [],
  });
  assert.deepEqual(findings[3]?.message, {
    key: 'checkRule.tailwindUnknown',
    params: { name: 'bg-nope' },
  });
  assert.deepEqual(findings[3]?.hint, { key: 'checkHint.tailwindUnknown', params: {} });
});

test('a class string may span lines and a template may hold more strings', () => {
  const text = [
    'export function Card({ state }: { state: string }) {',
    '  return (',
    '    <div',
    '      className="flex',
    '        gap-[3px]"',
    '    >',
    `      <span className={\`p-2 ${DOLLAR}{state === 'on' ? 'bg-[hsl(0_0%_0%)]' : ''}\`} />`,
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  assert.deepEqual(
    tailwindFindings({ file: FILE, text, unknown: [] }).map((finding) => [
      finding.rule,
      finding.severity,
      finding.line,
      finding.column,
    ]),
    [
      ['ds/tailwind-arbitrary', 'review', 5, 9],
      ['ds/tailwind-arbitrary', 'fix', 7, 49],
    ],
  );
});

test("a class with the project's prefix is held to the same rule, in Tailwind 3 and 4", () => {
  const text = [
    'export function Card() {',
    '  return <div className="tw-bg-[#fff] hover:tw-bg-[#fff] tw:bg-[#fff] tw-p-[13px]" />;',
    '}',
  ].join('\n');
  assert.deepEqual(
    tailwindFindings({ file: FILE, text, unknown: [] }).map((finding) => [
      finding.rule,
      finding.severity,
      finding.message.params,
    ]),
    [
      ['ds/tailwind-arbitrary', 'fix', { value: 'tw-bg-[#fff]' }],
      ['ds/tailwind-arbitrary', 'fix', { value: 'hover:tw-bg-[#fff]' }],
      ['ds/tailwind-arbitrary', 'fix', { value: 'tw:bg-[#fff]' }],
      ['ds/tailwind-arbitrary', 'review', { value: 'tw-p-[13px]' }],
    ],
  );
});

test('tailwind.json gives its unknown classes; anything else gives none', () => {
  const theme = { version: 4, prefix: '', screens: {} };
  assert.deepEqual(tailwindUnknown({ schemaVersion: 2, unknown: ['bg-nope'], theme }), ['bg-nope']);
  assert.deepEqual(tailwindUnknown({ schemaVersion: 1, unknown: ['bg-nope'] }), []);
  assert.deepEqual(tailwindUnknown({ schemaVersion: 2, unknown: [1], theme }), []);
  assert.deepEqual(tailwindUnknown(undefined), []);
});

test("a sheet's classes include nested ones made from the parent's", () => {
  const sheet = [
    '.order-summary {',
    '  padding: 0 .5rem;',
    '  &__title {',
    '    color: var(--kit-color-ink);',
    '  }',
    '  &.is-open,',
    '  &-wide {',
    '    margin: 0;',
    '  }',
    '  @media (min-width: 40rem) {',
    '    &-row {',
    '      gap: 0;',
    '    }',
    '  }',
    '}',
    '// .commented-out {}',
    '.hero:hover .hero-link {',
    '  color: inherit;',
    '}',
    '',
  ].join('\n');
  assert.deepEqual(sheetClasses(sheet), [
    'order-summary',
    'order-summary__title',
    'is-open',
    'order-summary-wide',
    'order-summary-row',
    'hero',
    'hero-link',
  ]);
});
