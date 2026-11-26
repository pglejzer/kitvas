import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  noEffectFindings,
  OPTION_RULE_IDS,
  unknownOptionFindings,
} from '../../../src/checks/index.ts';
import type { DraftOption } from '../../../src/shared/index.ts';

const COLUMNS: DraftOption = {
  id: 'columns',
  label: 'Columns',
  default: '3',
  values: [
    { id: '2', label: '2' },
    { id: '3', label: '3' },
  ],
};

test('the rule ids are the two of the contract', () => {
  assert.deepEqual(OPTION_RULE_IDS, ['options/no-effect', 'options/unknown']);
});

test('a value that looks like the default at both widths is one review finding', () => {
  const found = noEffectFindings('filled', [
    { id: 'columns', value: '2', width: 1280, same: true },
    { id: 'columns', value: '2', width: 390, same: true },
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'options/no-effect');
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.options, [{ id: 'columns', value: '2' }]);
  assert.deepEqual(found[0]?.states, ['filled']);
  assert.deepEqual(found[0]?.widths, [390, 1280]);
});

test('no effect says nothing when one width differs, a shot is missing, or there is nothing', () => {
  assert.deepEqual(
    noEffectFindings('filled', [
      { id: 'columns', value: '2', width: 390, same: true },
      { id: 'columns', value: '2', width: 1280, same: false },
    ]),
    [],
  );
  assert.deepEqual(
    noEffectFindings('filled', [{ id: 'columns', value: '2', width: 390, same: true }]),
    [],
  );
  assert.deepEqual(noEffectFindings('filled', []), []);
});

test('a selector naming an option or a value the file lacks is a fix with its place', () => {
  const text = [
    '.grid { color: red; }',
    '[data-opt-columns="2"] .grid { gap: 1px; }',
    '[data-opt-columns="9"] .grid { gap: 2px; }',
    "[data-opt-density='tight'] .grid { gap: 3px; }",
    '[data-opt-columns] .grid { gap: 4px; }',
    '/* [data-opt-ghost="x"] .grid { gap: 5px; } */',
  ].join('\n');
  const found = unknownOptionFindings([{ file: 'src/scss/sections/a.scss', text }], [COLUMNS]);
  assert.deepEqual(
    found.map((one) => [one.rule, one.severity, one.line, one.options]),
    [
      ['options/unknown', 'fix', 3, []],
      ['options/unknown', 'fix', 4, []],
    ],
  );
  assert.equal(found[0]?.file, 'src/scss/sections/a.scss');
  assert.equal(found[0]?.check, 'ds');
});

test('a version without options has no selector to check', () => {
  assert.deepEqual(
    unknownOptionFindings([{ file: 'a.scss', text: '.grid { gap: 1px; }' }], []),
    [],
  );
});
