import assert from 'node:assert/strict';
import { test } from 'node:test';
import { optionsIssues, parseOptions } from '../../../src/drafts/domain/options.ts';

const value = (id: string) => ({ id, label: id });
const option = (fields: Record<string, unknown> = {}) => ({
  id: 'columns',
  label: 'Columns',
  default: '3',
  values: [value('3'), value('2')],
  ...fields,
});
const file = (options: unknown[]) => ({ schemaVersion: 1, options });
const keys = (raw: unknown, themes: string[] = []) =>
  optionsIssues(raw, themes).map((issue) => issue.key);

test('a missing file has no problem and no options', () => {
  assert.deepEqual(optionsIssues(undefined, []), []);
  assert.deepEqual(parseOptions(undefined), []);
});

test('a good file reads and has no problem', () => {
  const raw = file([
    option(),
    option({ id: 'card-style', default: 'filled', values: [value('outlined'), value('filled')] }),
  ]);
  assert.deepEqual(keys(raw), []);
  assert.equal(parseOptions(raw).length, 2);
});

test('the limits of the schema are the shared ones', () => {
  const bad = [
    null,
    { options: [] },
    { schemaVersion: 2, options: [] },
    { ...file([]), extra: 1 },
    file(Array.from({ length: 9 }, (_, index) => option({ id: `o${index}` }))),
    file([option({ id: 'Columns' })]),
    file([option({ id: '' })]),
    file([option({ label: '' })]),
    file([option({ values: [value('3')] })]),
    file([option({ values: Array.from({ length: 7 }, (_, index) => value(`v${index}`)) })]),
    file([option({ values: [value('Dark'), value('2')], default: '2' })]),
    file([option({ values: [value('3'), value('3')] })]),
    file([option(), option()]),
    file([option({ extra: true })]),
  ];
  for (const raw of bad) {
    assert.deepEqual(keys(raw), ['draftIssue.optionsInvalid'], JSON.stringify(raw));
    assert.deepEqual(parseOptions(raw), []);
  }
});

test('eight options and six values are allowed', () => {
  const values = Array.from({ length: 6 }, (_, index) => value(`v${index}`));
  const raw = file(
    Array.from({ length: 8 }, (_, index) => option({ id: `o${index}`, default: 'v0', values })),
  );
  assert.deepEqual(keys(raw), []);
  assert.equal(parseOptions(raw).length, 8);
});

test('a default that is not one of the values is a problem, and the file reads as none', () => {
  const raw = file([option({ default: '4' })]);
  assert.deepEqual(keys(raw), ['draftIssue.optionsDefault']);
  assert.deepEqual(parseOptions(raw), []);
});

test('the option theme may name only the ids of the kit themes', () => {
  const theme = option({ id: 'theme', default: 'light', values: [value('light'), value('dark')] });
  assert.deepEqual(keys(file([theme]), ['light', 'dark']), []);
  assert.deepEqual(keys(file([theme]), ['light']), ['draftIssue.optionsTheme']);
  assert.deepEqual(keys(file([theme]), []), ['draftIssue.optionsTheme', 'draftIssue.optionsTheme']);
  // Another option is free to use other ids.
  assert.deepEqual(keys(file([option()]), []), []);
});
