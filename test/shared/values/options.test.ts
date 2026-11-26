import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  choiceFromQuery,
  choiceToQuery,
  type DraftOption,
  defaultChoice,
  OPTION_ID,
  OPTION_VALUE,
  offDefault,
  optionAttribute,
  optionSelector,
  pickChoice,
} from '../../../src/shared/values/options.ts';

const OPTIONS: DraftOption[] = [
  {
    id: 'columns',
    label: 'Columns',
    default: '3',
    values: [
      { id: '3', label: '3' },
      { id: '2', label: '2' },
    ],
  },
  {
    id: 'card-style',
    label: 'Cards',
    default: 'outlined',
    values: [
      { id: 'outlined', label: 'Outlined' },
      { id: 'filled', label: 'Filled' },
    ],
  },
];

test('the default choice names every option', () => {
  assert.deepEqual(defaultChoice(OPTIONS), { columns: '3', 'card-style': 'outlined' });
  assert.deepEqual(defaultChoice([]), {});
});

test('a choice drops an unknown id and turns an unknown value into the default', () => {
  assert.deepEqual(pickChoice(OPTIONS, { columns: '2', density: 'compact' }), {
    columns: '2',
    'card-style': 'outlined',
  });
  assert.deepEqual(pickChoice(OPTIONS, { columns: '9', 'card-style': 'filled' }), {
    columns: '3',
    'card-style': 'filled',
  });
});

test('only the values that differ from the defaults are named, in the options order', () => {
  assert.deepEqual(offDefault(OPTIONS, defaultChoice(OPTIONS)), []);
  assert.deepEqual(offDefault(OPTIONS, { 'card-style': 'filled', columns: '2' }), [
    { id: 'columns', value: '2' },
    { id: 'card-style', value: 'filled' },
  ]);
});

test('an address round-trips a choice and writes nothing for the defaults', () => {
  assert.deepEqual(choiceToQuery(OPTIONS, defaultChoice(OPTIONS)), []);
  const pairs = choiceToQuery(OPTIONS, { columns: '2', 'card-style': 'outlined' });
  assert.deepEqual(pairs, [['opt-columns', '2']]);
  const read = choiceFromQuery(OPTIONS, new URLSearchParams(pairs));
  assert.deepEqual(choiceToQuery(OPTIONS, read), pairs);
});

test('an address that names what the version lacks gives the defaults', () => {
  const query = new URLSearchParams('opt-columns=4&opt-theme=dark&state=empty');
  assert.deepEqual(choiceFromQuery(OPTIONS, query), defaultChoice(OPTIONS));
});

test('ids and values keep to their patterns', () => {
  assert.ok(OPTION_ID.test('card-style'));
  assert.ok(!OPTION_ID.test('Theme'));
  assert.ok(!OPTION_ID.test('2col'));
  assert.ok(!OPTION_ID.test(''));
  assert.ok(OPTION_VALUE.test('2'));
  assert.ok(OPTION_VALUE.test('with-links'));
  assert.ok(!OPTION_VALUE.test(''));
  assert.ok(!OPTION_VALUE.test('a"]'));
});

test('a value shows as one attribute and one selector', () => {
  assert.equal(optionAttribute('columns'), 'data-opt-columns');
  assert.equal(optionSelector('columns', '2'), '[data-opt-columns="2"]');
});
