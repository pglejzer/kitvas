import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pascal } from '../../../src/shared/values/names.ts';

test('pascal joins the capitalised parts of a dashed id', () => {
  assert.equal(pascal('hero'), 'Hero');
  assert.equal(pascal('pricing-table'), 'PricingTable');
  assert.equal(pascal('a-b-c'), 'ABC');
});

test('pascal drops empty parts', () => {
  assert.equal(pascal('-hero--card-'), 'HeroCard');
  assert.equal(pascal(''), '');
});
