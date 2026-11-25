import assert from 'node:assert/strict';
import { test } from 'node:test';
import { swapModKeys } from '../../../../client/studio/info/mac-keys.ts';

const keys = (): { textContent: string | null }[] => [{ textContent: 'Ctrl' }];

test('on an Apple platform Ctrl reads Cmd and Alt reads Option', () => {
  const mods = keys();
  const alts = [{ textContent: 'Alt' }];
  swapModKeys('MacIntel', mods, alts);
  assert.equal(mods[0]?.textContent, 'Cmd');
  assert.equal(alts[0]?.textContent, 'Option');
});

test('anywhere else the keys keep the names the page wrote', () => {
  const mods = keys();
  const alts = [{ textContent: 'Alt' }];
  swapModKeys('Win32', mods, alts);
  assert.equal(mods[0]?.textContent, 'Ctrl');
  assert.equal(alts[0]?.textContent, 'Alt');
});
