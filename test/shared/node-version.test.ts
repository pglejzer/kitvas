import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSupportedNode } from '../../src/shared/env/node-version.ts';

test('accepts patched 24 and 26 lines and anything newer', () => {
  for (const v of ['v24.22.3', 'v24.23.0', 'v26.13.1', '26.14.0', 'v27.0.0']) {
    assert.equal(isSupportedNode(v), true, v);
  }
});

test('rejects unpatched, unsupported and malformed versions', () => {
  for (const v of ['v24.22.1', 'v24.21.9', 'v25.9.0', 'v26.13.0', 'v22.23.5', 'banana']) {
    assert.equal(isSupportedNode(v), false, v);
  }
});
