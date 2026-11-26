import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  type BrowserInput,
  type BrowserRules,
  browserChecks,
  otherValues,
} from '../../../src/checks/index.ts';
import type { DraftOption } from '../../../src/shared/index.ts';
import { fakeBrowser } from '../../helpers/draft/checks.ts';

const DIR = join('drafts', 'shop', 'v1');
const NO_RULES: BrowserRules = { visit: [], states: [], deep: [], deepWidth: [] };

const COLUMNS: DraftOption = {
  id: 'columns',
  label: 'Columns',
  default: '3',
  values: [
    { id: '2', label: '2' },
    { id: '3', label: '3' },
    { id: '4', label: '4' },
  ],
};
const THEME: DraftOption = {
  id: 'theme',
  label: 'Theme',
  default: 'light',
  values: [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ],
};

const input = (over: Partial<BrowserInput> = {}): BrowserInput => ({
  versionDir: DIR,
  states: ['filled', 'empty'],
  ids: [],
  catalog: [],
  deep: false,
  screen: null,
  baseline: 'filled',
  ...over,
});

test('the other values are every value but the default, in the options order', () => {
  assert.deepEqual(otherValues([COLUMNS, THEME]), [
    { id: 'columns', value: '2' },
    { id: 'columns', value: '4' },
    { id: 'theme', value: 'dark' },
  ]);
  assert.deepEqual(otherValues([]), []);
});

test('a version without options makes the visits it always made', async () => {
  const fake = fakeBrowser();
  const result = await browserChecks(fake.browser, input(), NO_RULES);
  assert.equal(fake.visits.length, 6);
  assert.ok(fake.visits.every((visit) => Object.keys(visit.options).length === 0));
  assert.deepEqual(result.optionShots, []);
});

test('two options of two values add four visits: each other value at both main widths', async () => {
  const two: DraftOption = { ...COLUMNS, values: COLUMNS.values.slice(0, 2), default: '2' };
  const options: DraftOption[] = [two, THEME];
  const fake = fakeBrowser();
  const result = await browserChecks(fake.browser, input({ options }), NO_RULES);
  const added = fake.visits.slice(6);
  assert.equal(fake.visits.length, 6 + 4);
  assert.deepEqual(
    added.map((visit) => [visit.state, visit.width, visit.options, visit.passes.length > 0]),
    [
      ['filled', 390, { columns: '3' }, true],
      ['filled', 1280, { columns: '3' }, true],
      ['filled', 390, { theme: 'dark' }, true],
      ['filled', 1280, { theme: 'dark' }, true],
    ],
  );
  assert.equal(added[2]?.screenshot, join(DIR, 'build', 'shots', 'filled-390.theme-dark.png'));
  assert.deepEqual(
    result.optionShots.map((shot) => shot.file),
    [
      'build/shots/filled-390.columns-3.png',
      'build/shots/filled-1280.columns-3.png',
      'build/shots/filled-390.theme-dark.png',
      'build/shots/filled-1280.theme-dark.png',
    ],
  );
  assert.equal(result.optionShots[0]?.base, 'build/shots/filled-390.png');
  // The shots of the states stay the states'.
  assert.equal(result.shots.length, 4);
});

test('a finding seen only with columns=2 carries that option; one seen by default carries none', async () => {
  const fake = fakeBrowser((visit) => ({
    pageErrors: [...(visit.options.columns === '2' ? ['only two columns'] : []), 'everywhere'],
  }));
  const result = await browserChecks(
    fake.browser,
    input({ states: ['filled'], options: [COLUMNS] }),
    NO_RULES,
  );
  const only = result.findings.filter((finding) =>
    JSON.stringify(finding.message.params).includes('only two columns'),
  );
  assert.ok(only.length > 0);
  assert.ok(only.every((finding) => finding.options?.[0]?.id === 'columns'));
  assert.ok(only.every((finding) => finding.options?.[0]?.value === '2'));
  const everywhere = result.findings.filter((finding) =>
    JSON.stringify(finding.message.params).includes('everywhere'),
  );
  const byDefault = everywhere.filter((finding) => (finding.options ?? []).length === 0);
  assert.ok(byDefault.length > 0);
  // The same finding of a value comes tagged too: the merge makes it the default one.
  assert.ok(everywhere.some((finding) => finding.options?.[0]?.value === '2'));
});
