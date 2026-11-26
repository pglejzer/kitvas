// The kit colour a card names for a hand-written colour: the one the "Custom…" editor names for the
// same value, so two parts of one screen never offer two tokens.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  nearestColourToken,
  tokenLabel,
} from '../../../../../client/studio/edit/checks/nearest.ts';
import { nearestToken } from '../../../../../client/studio/edit/props/kit-value.ts';
import type { TokenOption } from '../../../../../src/edit/index.ts';

const token = (path: string, css: string): TokenOption => ({
  var: `--kit-${path.replace('.', '-')}`,
  path,
  type: 'color',
  css,
});
const GREEN = token('color.success-light', '#4caf50');
const GREY = token('color.grey-500', '#9e9e9e');
const VEIL = token('color.action-hover', 'rgb(0 0 0 / 0.04)');
const KIT = [GREEN, GREY, VEIL];

test('a card names the token the Custom editor names, also for a colour with an alpha', () => {
  for (const value of ['rgb(123 140 53 / 0.8)', 'rgb(123 140 53)', '#7b8c35', '#a0a0a0']) {
    const card = nearestColourToken(value, KIT);
    assert.notEqual(card, null, value);
    assert.equal(card, nearestToken(value, [GREEN, GREY]), value);
  }
  assert.equal(nearestColourToken('rgb(123 140 53 / 0.8)', KIT), GREEN);
  assert.equal(nearestColourToken('#a0a0a0', KIT), GREY);
});

test('a see-through token is never the nearest, and a value that is no colour has none', () => {
  assert.equal(nearestColourToken('rgb(0 0 0 / 0.04)', [VEIL]), null);
  assert.equal(nearestColourToken('currentColor', KIT), null);
  assert.equal(nearestColourToken('#7b8c35', []), null);
  assert.equal(tokenLabel(GREEN), 'success-light');
});
