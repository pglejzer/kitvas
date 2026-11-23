import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ClickInfo, isPlainClick } from '../../../client/studio/clicks.ts';

const PLAIN: ClickInfo = {
  button: 0,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  defaultPrevented: false,
};

test('a plain click with the main button is the page to handle', () => {
  assert.equal(isPlainClick(PLAIN), true);
});

test('another button, a held key or a handled click is left to the browser', () => {
  const others: Partial<ClickInfo>[] = [
    { button: 1 },
    { button: 2 },
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { defaultPrevented: true },
  ];
  for (const change of others) {
    assert.equal(isPlainClick({ ...PLAIN, ...change }), false, JSON.stringify(change));
  }
});
