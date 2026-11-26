// The control a component prop gets in Properties (plan 18f, task 2; spec S4.6 item 3).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  controlOf,
  MAX_CHIPS,
  type WrittenProp,
} from '../../../../../../client/studio/edit/props/controls/prop-control.ts';

const literal = (name: string, value: string): WrittenProp => ({
  name,
  kind: 'literal',
  value: { kind: 'string', value },
});

test('an enum is option chips, and a long one a list', () => {
  const values = ['primary', 'secondary', 'ghost'];
  assert.deepEqual(controlOf({ type: 'enum', values }), { kind: 'chips', options: values });
  const long = Array.from({ length: MAX_CHIPS + 1 }, (_, index) => `size-${index}`);
  assert.deepEqual(controlOf({ type: 'enum', values: long }), { kind: 'list', options: long });
  const most = long.slice(0, MAX_CHIPS);
  assert.equal(controlOf({ type: 'enum', values: most }).kind, 'chips');
  // An enum the catalog lists no value of has nothing to pick.
  assert.deepEqual(controlOf({ type: 'enum', values: [] }), { kind: 'static' });
  assert.deepEqual(controlOf({ type: 'enum' }), { kind: 'static' });
});

test('a boolean is a switch, a text or a number a field, anything else a value to read', () => {
  assert.deepEqual(controlOf({ type: 'boolean' }), { kind: 'switch' });
  assert.deepEqual(controlOf({ type: 'string' }), { kind: 'field', type: 'string' });
  assert.deepEqual(controlOf({ type: 'number' }), { kind: 'field', type: 'number' });
  assert.deepEqual(controlOf({ type: 'node' }), { kind: 'static' });
});

test('a prop the tag sets by code is a locked chip with the expression, whatever its type', () => {
  const source = '  isPro ? "primary" : "ghost" ';
  const written: WrittenProp = { name: 'variant', kind: 'expr', source };
  const values = ['primary', 'ghost'];
  assert.deepEqual(controlOf({ type: 'enum', values, written }), {
    kind: 'code',
    text: 'isPro ? "primary" : "ghost"',
  });
  assert.equal(controlOf({ type: 'boolean', written }).kind, 'code');
  // A literal the tag writes keeps the control of the type.
  const plain = literal('variant', 'ghost');
  assert.equal(controlOf({ type: 'enum', values, written: plain }).kind, 'chips');
});
