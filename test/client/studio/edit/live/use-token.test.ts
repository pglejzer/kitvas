// "Use <token>" on a live row: only a colour written by hand in the code gets it, with the token
// the Checks card and the "Custom…" editor name.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type TokenRow, tokenFixOf } from '../../../../../client/studio/edit/live/use-token.ts';
import type { TokenOption } from '../../../../../src/edit/index.ts';

const token = (path: string, css: string): TokenOption => ({
  var: `--kit-${path.replace('.', '-')}`,
  path,
  type: 'color',
  css,
});
const KIT = [token('color.success-light', '#4caf50'), token('color.grey-500', '#9e9e9e')];

const row = (fields: Partial<TokenRow> = {}): TokenRow => ({
  rule: 'ds/raw-color',
  source: 'code',
  waived: false,
  message: '"rgb(123 140 53 / 0.8)" is a colour written by hand. (info.scss:4)',
  raw: '"rgb(123 140 53 / 0.8)" is a colour written by hand.',
  ...fields,
});

test('a colour written by hand gets the nearest kit colour', () => {
  const found = tokenFixOf(row(), 'info:0', KIT);
  assert.deepEqual(found?.fix, { token: '--kit-color-success-light', label: 'success-light' });
  assert.deepEqual(found?.facts, {
    rule: 'ds/raw-color',
    message: '"rgb(123 140 53 / 0.8)" is a colour written by hand.',
    hint: '',
    element: 'info:0',
  });
  // Without the finding's own words the message is read.
  const { raw: _raw, ...bare } = row();
  assert.equal(tokenFixOf(bare, 'info:0', KIT)?.fix.label, 'success-light');
});

test('no token fix for a page finding, a dismissed one, no element, no colour or an empty kit', () => {
  assert.equal(tokenFixOf(row({ source: 'frame' }), 'info:0', KIT), null);
  assert.equal(tokenFixOf(row({ waived: true }), 'info:0', KIT), null);
  assert.equal(tokenFixOf(row(), null, KIT), null);
  assert.equal(tokenFixOf(row(), 'info:0', []), null);
  const size = row({
    rule: 'ds/raw-size',
    message: '"13px" is a size written by hand. (info.scss:9)',
    raw: '"13px" is a size written by hand.',
  });
  assert.equal(tokenFixOf(size, 'info:0', KIT), null);
});
