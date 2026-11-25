// The Changes pane's decisions (plan 18f, task 3): a change as chips with the old value struck, the
// filter and its counts, how long ago, and what a line records of its one value.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agoOf,
  changeChips,
  countChanges,
  cut,
  filterChanges,
  iconOfEntry,
  valuesOf,
} from '../../../../../client/studio/edit/history/change-chips.ts';
import type { ChangeChip, StepEntry } from '../../../../../client/studio/edit/history/chips.ts';
import { readChange } from '../../../../../client/studio/edit/history/keep-shape.ts';

const line = (over: Partial<StepEntry>): StepEntry => ({
  by: 'person',
  id: 'sections/Pricing:section/Button',
  label: 'size',
  files: [],
  offKit: false,
  at: 1_000,
  ...over,
});
const chip = (over: Partial<ChangeChip>): ChangeChip => ({
  kind: 'style',
  name: 'size',
  before: null,
  after: null,
  ...over,
});

test('a style change reads as the property, the old value struck and the new one', () => {
  const entry = line({ chips: [chip({ before: 'md', after: 'lg' })] });
  assert.deepEqual(changeChips(entry), [{ label: 'size', before: 'md', after: 'lg' }]);
});

test('a change recorded as before and after reads the same, under the line label', () => {
  const entry = line({ before: 'md', after: 'lg' });
  assert.deepEqual(changeChips(entry), [{ label: 'size', before: 'md', after: 'lg' }]);
});

test('a change with no old value shows the new one only', () => {
  const entry = line({ chips: [chip({ name: 'gap', before: null, after: 'lg' })] });
  assert.deepEqual(changeChips(entry), [{ label: 'gap', before: null, after: 'lg' }]);
  assert.deepEqual(changeChips(line({ after: 'lg' })), [
    { label: 'size', before: null, after: 'lg' },
  ]);
});

test('a line with neither chips nor a value has no chips', () => {
  assert.deepEqual(changeChips(line({ by: 'claude', id: null, files: ['a.tsx'] })), []);
});

test('a long value is cut to 24 characters with an ellipsis', () => {
  const long = 'x'.repeat(60);
  const [shown] = changeChips(line({ chips: [chip({ before: long, after: long })] }));
  assert.equal(shown?.before?.length, 24);
  assert.equal(shown?.after.length, 24);
  assert.equal(shown?.after.endsWith('…'), true);
  assert.equal(cut('short'), 'short');
  assert.equal(cut('y'.repeat(24)).length, 24);
  assert.equal(cut('y'.repeat(25)).endsWith('…'), true);
  assert.equal(changeChips(line({ before: long, after: long }))[0]?.after.length, 24);
});

test('a chip names itself through the view when it has no name of its own', () => {
  const entry = line({ chips: [chip({ kind: 'text', name: '', before: 'a', after: 'b' })] });
  assert.equal(
    changeChips(entry, (one) => (one.kind === 'text' ? 'text' : one.name))[0]?.label,
    'text',
  );
});

test('a removed value reads as an empty new value, which the view words', () => {
  const entry = line({ chips: [chip({ before: 'md', after: null })] });
  assert.deepEqual(changeChips(entry), [{ label: 'size', before: 'md', after: '' }]);
});

test('the filter counts all, yours and Claude', () => {
  const entries = [line({}), line({ by: 'claude', id: null }), line({}), line({})];
  assert.deepEqual(countChanges(entries), { all: 4, person: 3, claude: 1 });
  assert.equal(filterChanges(entries, 'all').length, 4);
  assert.equal(filterChanges(entries, 'person').length, 3);
  const claude = filterChanges(entries, 'claude');
  assert.equal(claude.length, 1);
  assert.equal(claude[0]?.by, 'claude');
  assert.deepEqual(countChanges([]), { all: 0, person: 0, claude: 0 });
});

test('a line records the one value its step changed', () => {
  assert.deepEqual(valuesOf([chip({ before: 'md', after: 'lg' })]), { before: 'md', after: 'lg' });
  assert.deepEqual(valuesOf([chip({ before: null, after: 'lg' })]), { after: 'lg' });
});

test('a step with several values, or one that removed a value, records none', () => {
  assert.deepEqual(valuesOf([]), {});
  assert.deepEqual(valuesOf([chip({ after: 'lg' }), chip({ name: 'gap', after: 'md' })]), {});
  assert.deepEqual(valuesOf([chip({ before: 'md', after: null })]), {});
});

test('the recorded values survive the kept history', () => {
  const kept = readChange(JSON.parse(JSON.stringify(line({ before: 'md', after: 'lg' }))));
  assert.equal(kept?.before, 'md');
  assert.equal(kept?.after, 'lg');
  assert.equal(readChange({ ...line({}), after: 3 }), null);
  assert.equal(readChange(JSON.parse(JSON.stringify(line({}))))?.after, undefined);
});

test('how long ago: now, minutes, hours and days', () => {
  const at = 10_000_000;
  assert.deepEqual(agoOf(at, at + 30_000), { unit: 'now', n: 0 });
  assert.deepEqual(agoOf(at, at + 2 * 60_000 + 5), { unit: 'min', n: 2 });
  assert.deepEqual(agoOf(at, at + 3 * 3_600_000), { unit: 'hour', n: 3 });
  assert.deepEqual(agoOf(at, at + 2 * 86_400_000), { unit: 'day', n: 2 });
  assert.deepEqual(agoOf(at, at - 5), { unit: 'now', n: 0 });
});

test('a text change wears the text icon, a whole file a section, any other the component', () => {
  assert.equal(iconOfEntry(line({ chips: [chip({ kind: 'text', name: '' })] })), 'text');
  assert.equal(iconOfEntry(line({ id: null, by: 'claude' })), 'section');
  assert.equal(iconOfEntry(line({ chips: [chip({})] })), 'component');
  assert.equal(iconOfEntry(line({})), 'component');
});
