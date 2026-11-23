import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_STATES, type Draft, type States } from '../../../src/drafts/index.ts';
import {
  draftHref,
  pickCompare,
  pickState,
  pickVersion,
  pickWidth,
} from '../../../src/studio/views/draft-query.ts';

const DRAFT: Draft = {
  schemaVersion: 1,
  slug: 'shop',
  title: 'Shop',
  kind: 'screen',
  kit: { id: 'base', version: '0.1.0', hash: 'a'.repeat(64) },
  createdAt: '2026-11-22T10:00:00.000Z',
  versions: [
    { number: 1, createdAt: '2026-11-22T10:00:00.000Z' },
    { number: 3, createdAt: '2026-11-22T11:00:00.000Z' },
  ],
};

const STATES: States = {
  schemaVersion: 1,
  default: 'filled',
  states: [
    { id: 'filled', label: 'With data' },
    { id: 'empty', label: 'Empty' },
  ],
};

const query = (text: string) => new URLSearchParams(text);

test('a version the draft has, else the latest', () => {
  assert.equal(pickVersion(query('version=1'), DRAFT), 1);
  assert.equal(pickVersion(query(''), DRAFT), 3);
  for (const asked of ['2', 'x', '-1', '1.5', '']) {
    assert.equal(pickVersion(query(`version=${asked}`), DRAFT), 3, asked);
  }
});

test('a state of this version, else its default', () => {
  assert.equal(pickState(query('state=empty'), STATES), 'empty');
  assert.equal(pickState(query('state=loading'), STATES), 'filled');
  assert.equal(pickState(query(''), DEFAULT_STATES), 'filled');
});

test('one of the three widths, else the phone', () => {
  assert.equal(pickWidth(query('width=768')), 768);
  assert.equal(pickWidth(query('width=1280')), 1280);
  for (const asked of ['', '1024', 'wide']) {
    assert.equal(pickWidth(query(`width=${asked}`)), 390, asked);
  }
});

test('a link to a view names the version, the state and the width', () => {
  assert.equal(
    draftHref('shop', { version: 3, state: 'empty', width: 768 }),
    '/drafts/shop?version=3&state=empty&width=768',
  );
});

test('compare: a version the draft has, other than the one shown, else none', () => {
  assert.equal(pickCompare(query('compare=1'), DRAFT, 3), 1);
  assert.equal(pickCompare(query('compare=3'), DRAFT, 1), 3);
  for (const asked of ['3', '2', '9', 'x', '', '0', '-1', '1.5']) {
    assert.equal(pickCompare(query(`compare=${asked}`), DRAFT, 3), null, asked);
  }
  assert.equal(pickCompare(query(''), DRAFT, 3), null);
});

test('a link keeps the comparison when it is given one', () => {
  assert.equal(
    draftHref('shop', { version: 3, state: 'empty', width: 768, compare: 1 }),
    '/drafts/shop?version=3&state=empty&width=768&compare=1',
  );
});
