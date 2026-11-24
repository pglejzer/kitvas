import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { splitWaived } from '../../src/checks/domain/waived.ts';
import { ChecksFileSchema, type Finding } from '../../src/checks/index.ts';
import { checkShop } from '../helpers/checks.ts';

const finding = (rule: string, element: string | null, severity: Finding['severity']): Finding => ({
  check: 'ds',
  rule,
  severity,
  file: 'src/scss/sections/hero.scss',
  line: 2,
  column: 3,
  element,
  message: 'm',
  hint: 'h',
  states: [],
  widths: [],
});

test('a waiver takes the findings of its rule on its element, and no others', () => {
  const findings = [
    finding('ds/raw-color', null, 'fix'),
    finding('ds/raw-control', 'Hero:main/button', 'review'),
    finding('ds/raw-control', 'Hero:main/button.2', 'review'),
    finding('ds/raw-size', 'Hero:main/button', 'review'),
  ];
  const { kept, waived } = splitWaived(findings, [
    { rule: 'ds/raw-color', element: null, reason: 'brand white' },
    { rule: 'ds/raw-control', element: 'Hero:main/button', reason: 'native control' },
  ]);
  assert.deepEqual(
    waived.map((one) => [one.rule, one.element, one.reason]),
    [
      ['ds/raw-color', null, 'brand white'],
      ['ds/raw-control', 'Hero:main/button', 'native control'],
    ],
  );
  assert.deepEqual(
    kept.map((one) => [one.rule, one.element]),
    [
      ['ds/raw-control', 'Hero:main/button.2'],
      ['ds/raw-size', 'Hero:main/button'],
    ],
  );
});

test('a waiver with no element never takes a finding that has one, and the other way round', () => {
  const { kept, waived } = splitWaived(
    [finding('ds/raw-color', 'Hero:main/p', 'fix'), finding('ds/raw-size', null, 'fix')],
    [
      { rule: 'ds/raw-color', element: null, reason: 'a' },
      { rule: 'ds/raw-size', element: 'Hero:main/p', reason: 'b' },
    ],
  );
  assert.equal(waived.length, 0);
  assert.equal(kept.length, 2);
});

test('with no waivers every finding stays', () => {
  const findings = [finding('ds/raw-color', null, 'fix')];
  assert.deepEqual(splitWaived(findings, []), { kept: findings, waived: [] });
});

const HERO = [
  "import { Button } from '@kit';",
  '',
  'export function Hero({ state }: { state: string }) {',
  '  return (',
  '    <section className="hero">',
  '      <h1>Shop</h1>',
  '      <p>State: {state}</p>',
  '      <Button variant="primary">Buy</Button>',
  '      <button type="button">Later</button>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const SHEET = '.hero {\n  color: #fff;\n  padding: 8px;\n}\n';
const CONTROL = 'sections/Hero:section/button';

const waiver = (rule: string, element: string | null, reason: string) => ({
  rule,
  element,
  reason,
  version: 1,
  at: '2026-11-24T10:00:00.000Z',
});

test('a check lists the accepted findings apart and leaves them out of what must be fixed', async () => {
  const shop = checkShop();
  try {
    shop.write('src/tsx/sections/Hero.tsx', HERO);
    shop.write('src/scss/sections/hero.scss', SHEET);
    const before = await shop.check();
    const open = before.findings.map((one) => one.rule);
    assert.ok(open.includes('ds/raw-color'));
    assert.ok(open.includes('ds/raw-control'));

    writeFileSync(
      join(shop.dir, 'waivers.json'),
      JSON.stringify({
        schemaVersion: 1,
        waivers: [
          waiver('ds/raw-color', null, 'brand white'),
          waiver('ds/raw-control', CONTROL, 'native control'),
          // An element the build does not have: the waiver does not carry.
          waiver('ds/raw-size', 'sections/Gone:section/p', 'gone'),
        ],
      }),
    );
    const after = await shop.check();
    assert.deepEqual(
      after.waived?.map((one) => [one.rule, one.reason]),
      [
        ['ds/raw-color', 'brand white'],
        ['ds/raw-control', 'native control'],
      ],
    );
    assert.equal(
      after.findings.some((one) => one.rule === 'ds/raw-color'),
      false,
    );
    assert.equal(
      after.findings.some((one) => one.rule === 'ds/raw-control'),
      false,
    );
    assert.equal(after.summary.waived, 2);
    assert.equal(after.summary.fix, before.summary.fix - 1);
    assert.equal(after.summary.review, before.summary.review - 1);
    // The file keeps them, and reads back.
    const saved = ChecksFileSchema.parse(JSON.parse(readFileSync(after.path, 'utf8')));
    assert.equal(saved.waived?.length, 2);
    assert.equal(saved.summary.waived, 2);
  } finally {
    await shop.close();
  }
});

test('a check with no waiver writes no waived list and no count', async () => {
  const shop = checkShop();
  try {
    const report = await shop.check();
    assert.equal(report.waived, undefined);
    assert.deepEqual(report.summary, { fix: 0, review: 0 });
  } finally {
    await shop.close();
  }
});
