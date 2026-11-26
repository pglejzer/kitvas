import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Draft } from '../../../src/drafts/index.ts';
import type { DraftOption } from '../../../src/shared/index.ts';
import { choiceLink } from '../../../src/studio/pages/draft/draft-links.ts';
import { draftHref, pickOptions } from '../../../src/studio/views/draft-query.ts';

const DRAFT: Draft = {
  schemaVersion: 1,
  slug: 'shop',
  title: 'Shop',
  kind: 'screen',
  kit: { id: 'base', version: '1.0.0', hash: 'a'.repeat(64) },
  createdAt: '2026-11-22T10:00:00.000Z',
  versions: [{ number: 1, createdAt: '2026-11-22T10:00:00.000Z' }],
};

const OPTIONS: DraftOption[] = [
  {
    id: 'columns',
    label: 'Columns',
    default: '3',
    values: [
      { id: '3', label: '3' },
      { id: '2', label: '2' },
    ],
  },
  {
    id: 'cards',
    label: 'Cards',
    default: 'outlined',
    values: [
      { id: 'outlined', label: 'Outlined' },
      { id: 'filled', label: 'Filled' },
    ],
  },
];

const query = (text: string) => new URLSearchParams(text);

test('an address holds only the values that differ from the defaults', () => {
  assert.deepEqual(pickOptions(query('opt-columns=2&opt-cards=filled'), OPTIONS), {
    columns: '2',
    cards: 'filled',
  });
  assert.deepEqual(pickOptions(query('opt-columns=3'), OPTIONS), {});
  assert.deepEqual(pickOptions(query(''), OPTIONS), {});
});

test('an option or a value the version lacks is dropped, not an error', () => {
  assert.deepEqual(pickOptions(query('opt-columns=9&opt-theme=dark&opt-cards=filled'), OPTIONS), {
    cards: 'filled',
  });
  assert.deepEqual(pickOptions(query('opt-columns=2'), []), {});
});

test('the address of a view writes a pair for each value that differs, and none for the defaults', () => {
  const base = { version: 1, state: 'filled', width: 1280 } as const;
  assert.equal(
    draftHref('shop', { ...base, options: { columns: '2' } }),
    '/drafts/shop?version=1&state=filled&width=1280&opt-columns=2',
  );
  assert.equal(
    draftHref('shop', { ...base, options: {} }),
    '/drafts/shop?version=1&state=filled&width=1280',
  );
  assert.equal(draftHref('shop', base), '/drafts/shop?version=1&state=filled&width=1280');
});

test('a link for another state keeps the values of the options', () => {
  const choice = { version: 1, state: 'filled', width: 1280, options: { columns: '2' } } as const;
  const link = choiceLink(DRAFT, choice);
  assert.equal(
    link({ state: 'empty' }),
    '/drafts/shop?version=1&state=empty&width=1280&opt-columns=2',
  );
  assert.equal(link({ width: 390 }), '/drafts/shop?version=1&state=filled&width=390&opt-columns=2');
});

test('a link that sets the values that differ replaces them; none writes no pair', () => {
  const choice = { version: 1, state: 'filled', width: 1280, options: { columns: '2' } } as const;
  const link = choiceLink(DRAFT, choice);
  assert.equal(
    link({ options: { cards: 'filled' } }),
    '/drafts/shop?version=1&state=filled&width=1280&opt-cards=filled',
  );
  assert.equal(link({ options: {} }), '/drafts/shop?version=1&state=filled&width=1280');
});
