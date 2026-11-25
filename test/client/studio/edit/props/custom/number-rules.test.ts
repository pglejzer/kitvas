import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTO,
  NONE,
  type NumberRule,
  parseAmount,
  readAmount,
  stepAmount,
  WEIGHT_RULE,
} from '../../../../../../client/studio/edit/props/custom/number-rules.ts';

const LENGTH: NumberRule = { min: 0, max: null, step: 1, units: ['px', 'rem', '%', AUTO] };
const MARGIN: NumberRule = { ...LENGTH, min: null };
const LINE: NumberRule = { min: 0, max: null, step: 0.1, units: [NONE, 'px', 'rem'] };

test('an arrow key steps by the rule, Shift by ten', () => {
  assert.equal(stepAmount('17', 1, false, LENGTH), '18');
  assert.equal(stepAmount('17', -1, false, LENGTH), '16');
  assert.equal(stepAmount('17', 1, true, LENGTH), '27');
  assert.equal(stepAmount('1.5', 1, false, LINE), '1.6');
  assert.equal(stepAmount('0.1', 1, false, LINE), '0.2');
});

test('a weight steps by 100 between 1 and 1000', () => {
  assert.equal(stepAmount('400', 1, false, WEIGHT_RULE), '500');
  assert.equal(stepAmount('400', -1, false, WEIGHT_RULE), '300');
  assert.equal(stepAmount('100', -1, false, WEIGHT_RULE), '1');
  assert.equal(stepAmount('900', 1, false, WEIGHT_RULE), '1000');
  assert.equal(stepAmount('400', 1, true, WEIGHT_RULE), '1000');
});

test('an empty field starts from the given value', () => {
  assert.equal(stepAmount('', 1, false, WEIGHT_RULE, 400), '500');
  assert.equal(stepAmount('x', -1, false, LENGTH, 16), '15');
});

test('a length keeps its unit, a weight has none', () => {
  assert.deepEqual(parseAmount('17', 'px', LENGTH), { ok: true, css: '17px' });
  assert.deepEqual(parseAmount(' 1.25 ', 'rem', LENGTH), { ok: true, css: '1.25rem' });
  assert.deepEqual(parseAmount('50', '%', LENGTH), { ok: true, css: '50%' });
  assert.deepEqual(parseAmount('650', NONE, WEIGHT_RULE), { ok: true, css: '650' });
  assert.deepEqual(parseAmount('1.5', NONE, LINE), { ok: true, css: '1.5' });
  assert.deepEqual(parseAmount('24', 'px', LINE), { ok: true, css: '24px' });
});

test('auto writes the keyword and needs no amount', () => {
  assert.deepEqual(parseAmount('', AUTO, LENGTH), { ok: true, css: 'auto' });
});

test('a value that is no number is refused with the reason', () => {
  for (const text of ['', '1,5x', 'abc', '12px', '--', '1e3']) {
    const parsed = parseAmount(text, 'px', LENGTH);
    assert.equal(parsed.ok, false, text);
    if (!parsed.ok) assert.equal(parsed.reason.key, 'number');
  }
});

test('the limits refuse with the limit named', () => {
  assert.deepEqual(parseAmount('-4', 'px', LENGTH), {
    ok: false,
    reason: { key: 'min', limit: 0 },
  });
  assert.deepEqual(parseAmount('-4', 'px', MARGIN), { ok: true, css: '-4px' });
  assert.deepEqual(parseAmount('1001', NONE, WEIGHT_RULE), {
    ok: false,
    reason: { key: 'max', limit: 1000 },
  });
  assert.deepEqual(parseAmount('0', NONE, WEIGHT_RULE), {
    ok: false,
    reason: { key: 'min', limit: 1 },
  });
});

test('a value of the source is read as an amount and a unit', () => {
  assert.deepEqual(readAmount('17px', LENGTH), { amount: '17', unit: 'px', unread: null });
  assert.deepEqual(readAmount('1.5rem', LENGTH), { amount: '1.5', unit: 'rem', unread: null });
  assert.deepEqual(readAmount('auto', LENGTH), { amount: '', unit: AUTO, unread: null });
  assert.deepEqual(readAmount('0', LENGTH), { amount: '0', unit: 'px', unread: null });
  assert.deepEqual(readAmount('12vh', LENGTH), { amount: '', unit: 'px', unread: '12vh' });
  assert.deepEqual(readAmount('650', WEIGHT_RULE), { amount: '650', unit: NONE, unread: null });
  assert.deepEqual(readAmount('1.5', LINE), { amount: '1.5', unit: NONE, unread: null });
  assert.deepEqual(readAmount('24px', LINE), { amount: '24', unit: 'px', unread: null });
  assert.deepEqual(readAmount(null, LENGTH), { amount: '', unit: 'px', unread: null });
});
