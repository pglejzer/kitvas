// What a change did, as chips (plan 18, task D): one per changed thing, joined across elements.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type ChangeChip,
  changeChips,
  MAX_CHIP_TEXT,
  MAX_CHIPS,
  opChip,
  opChips,
  styleWords,
} from '../../../../../client/studio/edit/history/chips.ts';
import type { EditOp } from '../../../../../src/edit/index.ts';

const ID = 'sections/Pricing:section/Stack/Card.2';
const OTHER = 'sections/Pricing:section/Stack/Card.3';

const gap = (id: string, value: string, before: string | null): EditOp => ({
  op: 'setStyle',
  id,
  className: 'card',
  property: 'gap',
  value: { token: value },
  before: before === null ? null : { token: before },
  newRule: false,
});
const chip = (over: Partial<ChangeChip>): ChangeChip => ({
  kind: 'style',
  name: 'gap',
  before: null,
  after: null,
  ...over,
});

test('a token is named by its path, a raw value as it is written', () => {
  assert.equal(styleWords({ token: '--kit-space-md' }), 'space.md');
  assert.equal(styleWords({ raw: '12px' }), '12px');
});

test('each op that sets a value has a chip with what it was and what it is', () => {
  assert.deepEqual(opChip(gap(ID, '--kit-space-lg', '--kit-space-md')), {
    kind: 'style',
    name: 'gap',
    before: 'space.md',
    after: 'space.lg',
  });
  const size: EditOp = {
    op: 'setProp',
    id: ID,
    name: 'size',
    value: { kind: 'string', value: 'lg' },
    before: { kind: 'string', value: 'md' },
    after: null,
  };
  assert.deepEqual(opChip(size), { kind: 'prop', name: 'size', before: 'md', after: 'lg' });
  const off: EditOp = {
    op: 'removeProp',
    id: ID,
    name: 'disabled',
    before: { kind: 'boolean', value: true },
    after: null,
  };
  assert.deepEqual(opChip(off), { kind: 'prop', name: 'disabled', before: 'true', after: null });
  const words: EditOp = { op: 'setText', id: ID, value: 'Buy now', before: 'Buy' };
  assert.deepEqual(opChip(words), { kind: 'text', name: '', before: 'Buy', after: 'Buy now' });
  const utility: EditOp = { op: 'setUtility', id: ID, value: 'p-4', before: null };
  assert.deepEqual(opChip(utility), { kind: 'utility', name: '', before: null, after: 'p-4' });
});

test('an op that changes no named value has no chip', () => {
  assert.equal(opChip({ op: 'addClass', id: ID, className: 'card' }), null);
  assert.equal(opChip({ op: 'moveElement', id: ID, anchor: OTHER, place: 'before' }), null);
});

test('the same thing on several elements is one chip: the first before, the last after', () => {
  const ops = [gap(ID, '--kit-space-md', '--kit-space-sm'), gap(OTHER, '--kit-space-lg', null)];
  assert.deepEqual(opChips(ops), [chip({ before: 'space.sm', after: 'space.lg' })]);
});

test('a step shows at most a few chips, and a long text is cut short', () => {
  const ops = ['gap', 'padding', 'margin', 'width'].map(
    (property): EditOp => ({
      op: 'setStyle',
      id: ID,
      className: 'card',
      property,
      value: { raw: '4px' },
      before: null,
      newRule: false,
    }),
  );
  assert.equal(opChips(ops).length, MAX_CHIPS);
  const long = 'x'.repeat(MAX_CHIP_TEXT + 10);
  const [cut] = opChips([{ op: 'setText', id: ID, value: long, before: '' }]);
  assert.equal(cut?.after?.length, MAX_CHIP_TEXT);
  assert.ok(cut?.after?.endsWith('…'));
});

test("a variant's changes are chips of what they set, before their elements are read", () => {
  const chips = changeChips([
    { kind: 'style', id: ID, property: 'gap', value: { token: '--kit-space-lg' } },
    { kind: 'prop', id: ID, name: 'variant', value: { kind: 'string', value: 'outline' } },
    { kind: 'text', id: OTHER, value: 'Start free' },
  ]);
  assert.deepEqual(chips, [
    chip({ after: 'space.lg' }),
    { kind: 'prop', name: 'variant', before: null, after: 'outline' },
    { kind: 'text', name: '', before: null, after: 'Start free' },
  ]);
});
