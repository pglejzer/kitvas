import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { A11yCard } from '../../../../../../client/channel/live-protocol.ts';
import {
  optionWarning,
  type Resolve,
} from '../../../../../../client/studio/edit/props/values/warn.ts';

const CARD = {} as unknown as A11yCard;

test('only colour and size options of an element with a known card are checked', () => {
  const asked: [string, string][] = [];
  const resolve: Resolve = (kind, css) => {
    asked.push([kind, css]);
    return null;
  };
  assert.equal(optionWarning('color', '#000', null, resolve), null, 'no card yet');
  assert.equal(optionWarning('display', 'grid', CARD, resolve), null, 'a keyword');
  assert.equal(optionWarning('font-weight', '600', CARD, resolve), null, 'a weight');
  assert.deepEqual(asked, []);
  optionWarning('color', '#000', CARD, resolve);
  optionWarning('padding', '1rem', CARD, resolve);
  assert.deepEqual(asked, [
    ['color', '#000'],
    ['dimension', '1rem'],
  ]);
});
