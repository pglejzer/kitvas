import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Finding,
  mergeFindings,
  type RawFinding,
  readChecks,
  translateFinding,
} from '../../../src/checks/index.ts';
import { serializeJson } from '../../../src/drafts/index.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';
import { checksOf, finding } from '../../helpers/studio/findings.ts';

const raw = (change: Partial<RawFinding> = {}): RawFinding => ({
  check: 'ui',
  rule: 'ui/overflow',
  severity: 'review',
  file: null,
  line: 0,
  column: 0,
  element: 'sections/Hero:section',
  message: { key: 'checkRule.x', params: {} },
  hint: { key: 'checkHint.x', params: {} },
  states: ['filled'],
  widths: [390],
  ...change,
});
const t = (key: string): string => key;
const words = (change: Partial<RawFinding> = {}): Finding => translateFinding(raw(change), t);

test('a finding of the default combination has no options, written as an empty list', () => {
  assert.deepEqual(words().options, []);
});

test('a finding seen only with a value keeps it; two values of one option are both kept', () => {
  const merged = mergeFindings([
    words({ options: [{ id: 'columns', value: '2' }] }),
    words({ options: [{ id: 'columns', value: '4' }], widths: [1280] }),
    words({ options: [{ id: 'columns', value: '2' }], widths: [1280] }),
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0]?.options, [
    { id: 'columns', value: '2' },
    { id: 'columns', value: '4' },
  ]);
  assert.deepEqual(merged[0]?.widths, [390, 1280]);
});

test('a finding seen in the default combination and in a value stays the default one', () => {
  const inValue = words({ options: [{ id: 'columns', value: '2' }] });
  assert.deepEqual(mergeFindings([words(), inValue])[0]?.options, []);
  assert.deepEqual(mergeFindings([inValue, words()])[0]?.options, []);
});

test('a checks.json written before options reads as the default combination', () => {
  const { store } = shopDraft();
  const { options: _none, ...old } = finding();
  const file = { ...checksOf([]), findings: [old] };
  store.writeText('shop', 'v1/build/json/checks.json', serializeJson(file));
  assert.deepEqual(readChecks(store, 'shop', 1)?.findings[0]?.options, []);
});
