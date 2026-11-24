// The pure helpers of the page inventory: text folding and the number in a price.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalise, priceValue } from '../../../src/checks/domain/rework/inventory.ts';

test('priceValue reads the number in a price, whatever its separators and currency', () => {
  assert.equal(priceValue('$1,299.00'), 1299);
  assert.equal(priceValue('1 299,00 zł'), 1299);
  assert.equal(priceValue('€15'), 15);
  assert.equal(priceValue('12.50 EUR'), 12.5);
  assert.equal(priceValue('USD 1.299'), 1299);
  assert.equal(priceValue('1 299,50 PLN'), 1299.5);
});

test('priceValue is null without digits, with other letters, or with other signs', () => {
  assert.equal(priceValue('Call us'), null);
  assert.equal(priceValue('12.5%'), null);
  assert.equal(priceValue(''), null);
  assert.equal(priceValue('$'), null);
  assert.equal(priceValue('from $15'), null);
  assert.equal(priceValue('15,'), null);
});

test('normalise folds case, spacing, quotes and dashes', () => {
  assert.equal(normalise('  Hello   World \n'), 'hello world');
  assert.equal(normalise('“It’s”'), '"it\'s"');
  assert.equal(normalise('A – B — C'), 'a - b - c');
  assert.equal(normalise('ＡＢＣ'), 'abc');
});

test('normalise of nothing is nothing', () => {
  assert.equal(normalise(''), '');
  assert.equal(normalise(' \t\n '), '');
});
