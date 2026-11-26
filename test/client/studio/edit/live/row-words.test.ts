import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evidenceOf } from '../../../../../client/studio/edit/live/evidence.ts';
import { codeItem, liveGroups, openCount } from '../../../../../client/studio/edit/live/items.ts';
import {
  isColourValue,
  quotedValue,
  rowNameKey,
  ruleNameKey,
  type Say,
  whereWords,
} from '../../../../../client/studio/edit/live/row-words.ts';
import type { LiveCodeFinding } from '../../../../../src/studio/api/edit/live-schemas.ts';
import { t } from '../../../../helpers/translate.ts';

const say: Say = (key, params) => t(`studio.edit.${key}`, params);

const finding = (patch: Partial<LiveCodeFinding>): LiveCodeFinding => ({
  rule: 'ds/raw-color',
  severity: 'fix',
  file: 'src/scss/sections/info.scss',
  line: 4,
  element: 'sections/Info:section',
  message: '"rgb(123 140 53 / 0.87)" is a colour written by hand.',
  ...patch,
});

test('every code rule that reaches the live list has a short name in plain words', () => {
  const rules = [
    ['ds/raw-color', 'Colour written by hand'],
    ['ds/raw-size', 'Value written by hand'],
    ['ds/unknown-token', 'Token is not in the kit'],
    ['ds/foreign-import', 'Import from outside the kit'],
    ['ds/style-import', 'Style import is not needed'],
    ['ds/not-in-catalog', 'Component is not in the kit'],
    ['ds/raw-control', "Plain control, not the kit's"],
    ['ds/tailwind-arbitrary', "Value outside the kit's theme"],
    ['ds/tailwind-unknown', 'Class the kit does not have'],
    ['ui/transition-all', 'Transition on every property'],
    ['ui/image-size', 'Image has no size'],
    ['ui/clipped-text', 'Text is cut off'],
  ] as const;
  for (const [rule, words] of rules) {
    const key = ruleNameKey(rule);
    assert.ok(key, rule);
    assert.equal(t(`studio.edit.${key}`), words, rule);
  }
  assert.equal(ruleNameKey('ds/some-new-rule'), null);
});

test('a finding with measured evidence is named by it; a code finding by its rule', () => {
  const contrast = {
    rule: 'a11y/color-contrast',
    evidence: evidenceOf({ message: 'm', values: { ratio: 3, needed: 4.5 } }),
  };
  assert.equal(rowNameKey(contrast), 'checks.name.contrast');
  const code = { rule: 'ds/raw-color', evidence: evidenceOf({ message: 'm', values: null }) };
  assert.equal(rowNameKey(code), 'checks.name.rawColor');
  const unknown = { rule: 'x/y', evidence: evidenceOf({ message: 'm', values: null }) };
  assert.equal(rowNameKey(unknown), null);
});

test('a code row keeps its own words and its place apart from its title', () => {
  const item = codeItem(finding({}));
  assert.equal(item.raw, '"rgb(123 140 53 / 0.87)" is a colour written by hand.');
  assert.deepEqual(item.place, { file: 'info.scss', line: 4 });
  const [group] = liveGroups([item], []);
  const row = group?.rows[0];
  assert.equal(row?.raw, item.raw);
  assert.deepEqual(row?.place, { file: 'info.scss', line: 4 });
});

test('the where line: file and line in the code, widths in the page', () => {
  assert.equal(
    whereWords({ widths: [], place: { file: 'info.scss', line: 4 } }, say),
    'info.scss, line 4',
  );
  assert.equal(whereWords({ widths: [], place: { file: 'Hero.tsx', line: 0 } }, say), 'Hero.tsx');
  assert.equal(whereWords({ widths: [390, 1280] }, say), 'At 390, 1280 px');
  assert.equal(whereWords({ widths: [] }, say), 'In the code');
});

test('a colour is told from other values, and a quoted value is found', () => {
  for (const colour of [
    '#fff',
    '#1a73e8cc',
    'rgb(1 2 3 / 0.5)',
    'rgba(0, 0, 0, 0.87)',
    'oklch(0.5 0.1 20)',
  ]) {
    assert.ok(isColourValue(colour), colour);
  }
  for (const other of ['12px', 'bold', 'var(--x)', '@kit']) assert.ok(!isColourValue(other), other);
  assert.equal(quotedValue('"@kit" is not the kit.'), '@kit');
  assert.equal(quotedValue('A plain <button> is used where the kit has Button.'), '<button>');
  assert.equal(quotedValue('Nothing quoted here.'), null);
});

test('the block counts the findings that still stand, not the dismissed ones', () => {
  const waived = [
    {
      rule: 'ds/raw-color',
      element: 'sections/Info:section',
      reason: 'ok',
      version: 1,
      at: '2026-11-26T10:00:00.000Z',
    },
  ];
  const groups = liveGroups(
    [
      codeItem(finding({})),
      codeItem(finding({ rule: 'ds/raw-size', message: '12px is not a step.' })),
    ],
    waived,
  );
  assert.equal(openCount(groups), 1);
  assert.equal(openCount([]), 0);
});
