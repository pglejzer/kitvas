import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_STATES, type Draft, type States } from '../../../src/drafts/index.ts';
import {
  draftHref,
  extraWidths,
  nearestPreset,
  pickCards,
  pickCompare,
  pickState,
  pickVersion,
  pickView,
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

test('a view is any whole width from 320 to 2560 that is not a preset', () => {
  assert.equal(pickView(query('view=1000')), 1000);
  assert.equal(pickView(query('view=320')), 320);
  assert.equal(pickView(query('view=2560')), 2560);
  for (const asked of ['', '319', '2561', '99999', '1000.5', '-1000', 'wide', '1e3', '10']) {
    assert.equal(pickView(query(`view=${asked}`)), null, asked);
  }
  assert.equal(pickView(query('')), null);
});

test('a preset asked for as a view is no view: the width names it', () => {
  for (const preset of [390, 768, 1280]) {
    assert.equal(pickView(query(`view=${preset}`)), null, String(preset));
  }
});

test('the view does not change the width the checks belong to', () => {
  assert.equal(pickWidth(query('width=768&view=1000')), 768);
  assert.equal(pickWidth(query('view=1000')), 390);
});

test('a link keeps the custom width when it is given one, after everything else', () => {
  assert.equal(
    draftHref('shop', { version: 3, state: 'empty', width: 768, view: 1000 }),
    '/drafts/shop?version=3&state=empty&width=768&view=1000',
  );
  assert.equal(
    draftHref('shop', { version: 3, state: 'empty', width: 768, compare: 1, view: 1000 }),
    '/drafts/shop?version=3&state=empty&width=768&compare=1&view=1000',
  );
});

test('a link keeps the comparison when it is given one', () => {
  assert.equal(
    draftHref('shop', { version: 3, state: 'empty', width: 768, compare: 1 }),
    '/drafts/shop?version=3&state=empty&width=768&compare=1',
  );
});

test('the cards are 1, 2 or 3, and one for anything else', () => {
  assert.equal(pickCards(query('cards=2')), 2);
  assert.equal(pickCards(query('cards=3')), 3);
  for (const asked of ['', '1', '0', '4', 'all', '2.5']) {
    assert.equal(pickCards(query(`cards=${asked}`)), 1, asked);
  }
  assert.equal(pickCards(query('')), 1);
});

test('a link keeps more than one card last, and names none for one or while comparing', () => {
  assert.equal(
    draftHref('shop', { version: 3, state: 'empty', width: 768, view: 1000, cards: 3 }),
    '/drafts/shop?version=3&state=empty&width=768&view=1000&cards=3',
  );
  assert.equal(
    draftHref('shop', { version: 3, state: 'empty', width: 768, cards: 1 }),
    '/drafts/shop?version=3&state=empty&width=768',
  );
  assert.equal(
    draftHref('shop', { version: 3, state: 'empty', width: 768, compare: 1, cards: 2 }),
    '/drafts/shop?version=3&state=empty&width=768&compare=1',
  );
});

test('two cards add the next preset up, or the one below at the widest', () => {
  assert.deepEqual(extraWidths(2, 390), [768]);
  assert.deepEqual(extraWidths(2, 768), [1280]);
  assert.deepEqual(extraWidths(2, 1280), [768]);
  assert.deepEqual(extraWidths(2, 1000), [1280]);
  assert.deepEqual(extraWidths(2, 2000), [1280]);
  assert.deepEqual(extraWidths(2, 320), [390]);
});

test('three cards add the presets the width shown does not stand for', () => {
  assert.deepEqual(extraWidths(3, 390), [768, 1280]);
  assert.deepEqual(extraWidths(3, 768), [390, 1280]);
  assert.deepEqual(extraWidths(3, 1280), [390, 768]);
  // A custom width stands for its nearest preset.
  assert.deepEqual(extraWidths(3, 700), [390, 1280]);
  assert.deepEqual(extraWidths(3, 2400), [390, 768]);
  assert.deepEqual(extraWidths(1, 768), []);
});

test('the nearest preset of a width; the narrower of two as near', () => {
  assert.equal(nearestPreset(320), 390);
  assert.equal(nearestPreset(579), 390);
  assert.equal(nearestPreset(1024), 768);
  assert.equal(nearestPreset(1100), 1280);
  assert.equal(nearestPreset(579 + 0.5), 768);
});
