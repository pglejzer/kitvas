// A click on a lens pin (plan 19, task 1): each kind opens its pane, and the pin's key names the
// row scrolled into view.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PIN_KINDS } from '../../../../client/channel/lens-protocol.ts';
import { PIN_PANES, rowOfKey } from '../../../../client/studio/lens/open.ts';

test('kit opens Properties, check Checks, why Why and change Changes', () => {
  assert.deepEqual(
    PIN_KINDS.map((kind) => PIN_PANES[kind]),
    ['properties', 'checks', 'why', 'changes'],
  );
});

test('a check pin names the finding it came from, a why pin its section', () => {
  assert.deepEqual(rowOfKey({ kind: 'check', key: 'check:f12' }), { kind: 'finding', index: 12 });
  assert.deepEqual(rowOfKey({ kind: 'check', key: 'check:l3.1' }), {
    kind: 'live',
    group: 3,
    row: 1,
  });
  assert.deepEqual(rowOfKey({ kind: 'why', key: 'why:OrderSummary' }), {
    kind: 'section',
    name: 'OrderSummary',
  });
  assert.deepEqual(rowOfKey({ kind: 'change', key: 'change:4' }), { kind: 'change' });
});

test('a key that names no row only opens the pane', () => {
  assert.deepEqual(rowOfKey({ kind: 'why', key: 'why#3' }), { kind: 'none' });
  assert.deepEqual(rowOfKey({ kind: 'check', key: 'check:x' }), { kind: 'none' });
  assert.deepEqual(rowOfKey({ kind: 'kit', key: 'kit:a:gap' }), { kind: 'none' });
  // The kind decides: a key of another kind's shape is not read as one.
  assert.deepEqual(rowOfKey({ kind: 'kit', key: 'check:f1' }), { kind: 'none' });
});
