// The client side of waivers (spec 4c, goal 6): the reason rule, which waiver belongs to which
// row, and which key a Checks row carries.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_REASON,
  noteKey,
  QUICK_REASON_KEYS,
  reasonProblem,
  reasonRequest,
  waiverOf,
} from '../../../../../client/studio/edit/live/waivers.ts';
import { MAX_REASON as SERVER_MAX } from '../../../../../src/studio/api/waivers/waiver-schemas.ts';
import { t } from '../../../../helpers/translate.ts';

const ELEMENT = 'sections/Hero:section/Button';

const waiver = (rule: string, element: string | null, reason = 'brand') => ({
  rule,
  element,
  reason,
  version: 1,
  at: '2026-11-24T10:00:00.000Z',
});

test('the page and the server agree on the longest reason', () => {
  assert.equal(MAX_REASON, SERVER_MAX);
  assert.equal(MAX_REASON, 300);
});

test('a reason is needed, and spaces alone are none', () => {
  assert.equal(reasonProblem(''), 'empty');
  assert.equal(reasonProblem('   \n '), 'empty');
  assert.equal(reasonProblem('Our brand colour'), null);
});

test('a reason of 300 characters is taken and one of 301 is too long', () => {
  assert.equal(reasonProblem('x'.repeat(300)), null);
  assert.equal(reasonProblem('x'.repeat(301)), 'long');
  // The server trims first, so the spaces around a long reason do not count.
  assert.equal(reasonProblem(`  ${'x'.repeat(300)}  `), null);
});

test('a waiver belongs to its rule on its element and to nothing else', () => {
  const waivers = [waiver('a11y/color-contrast', ELEMENT), waiver('ds/raw-color', null, 'logo')];
  assert.equal(
    waiverOf(waivers, { rule: 'a11y/color-contrast', element: ELEMENT })?.reason,
    'brand',
  );
  assert.equal(waiverOf(waivers, { rule: 'ds/raw-color', element: null })?.reason, 'logo');
  assert.equal(waiverOf(waivers, { rule: 'a11y/color-contrast', element: null }), undefined);
  assert.equal(waiverOf(waivers, { rule: 'ds/raw-color', element: ELEMENT }), undefined);
  assert.equal(waiverOf(waivers, { rule: 'a11y/target-size', element: ELEMENT }), undefined);
  assert.equal(waiverOf([], { rule: 'ds/raw-color', element: null }), undefined);
});

test('a row of the Checks list gives its rule and its element, even once it is accepted', () => {
  assert.deepEqual(noteKey({ rule: 'ds/raw-color', element: ELEMENT, waivedElement: undefined }), {
    rule: 'ds/raw-color',
    element: ELEMENT,
  });
  assert.deepEqual(
    noteKey({ rule: ' ds/raw-color ', element: undefined, waivedElement: ELEMENT }),
    { rule: 'ds/raw-color', element: ELEMENT },
  );
  assert.deepEqual(
    noteKey({ rule: 'ds/raw-color', element: undefined, waivedElement: undefined }),
    {
      rule: 'ds/raw-color',
      element: null,
    },
  );
});

test('each quick reason is saved at once, its own text as the reason', () => {
  const key = { rule: 'a11y/color-contrast', element: ELEMENT };
  assert.deepEqual(
    QUICK_REASON_KEYS.map((name) => t(`studio.edit.${name}`)),
    ['Fine as it is', "The kit's own look", 'False alarm'],
  );
  for (const name of QUICK_REASON_KEYS) {
    const words = t(`studio.edit.${name}`);
    assert.deepEqual(reasonRequest(key, words), { ok: true, body: { ...key, reason: words } });
  }
});

test('"Other…" keeps the validation: empty, spaces and over 300 characters are not sent', () => {
  const key = { rule: 'ds/raw-color', element: null };
  assert.deepEqual(reasonRequest(key, ''), { ok: false, problem: 'empty' });
  assert.deepEqual(reasonRequest(key, '  \n'), { ok: false, problem: 'empty' });
  assert.deepEqual(reasonRequest(key, 'x'.repeat(301)), { ok: false, problem: 'long' });
  assert.deepEqual(reasonRequest(key, `  ${'x'.repeat(300)} `), {
    ok: true,
    body: { rule: 'ds/raw-color', element: null, reason: 'x'.repeat(300) },
  });
});

test('the words people read say dismiss and restore, never accept or withdraw', () => {
  assert.equal(t('studio.edit.waiver.accept'), 'Dismiss this finding');
  assert.equal(t('studio.edit.waiver.reasonLabel'), 'Why dismiss it?');
  assert.equal(t('studio.edit.waiver.accepted', { reason: 'ok' }), 'Dismissed: ok');
  assert.equal(t('studio.edit.waiver.withdraw'), 'Restore');
  assert.equal(t('studio.notes.filter.accepted'), 'Dismissed');
});

test('a row with no rule has no key', () => {
  assert.equal(noteKey({ rule: null, element: ELEMENT, waivedElement: undefined }), null);
  assert.equal(noteKey({ rule: '  ', element: undefined, waivedElement: undefined }), null);
});
