import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createOwn,
  type DraftsChange,
  draftsEventOf,
  needsLook,
  OWN_MS,
} from '../../../../client/studio/trash/events.ts';

const event = (data: string, name = 'drafts') => ({ event: name, data });

test('a drafts event names the draft and what happened to it', () => {
  for (const change of ['deleted', 'restored', 'purged'] as const) {
    const data = JSON.stringify({ slug: 'shop', change });
    assert.deepEqual(draftsEventOf(event(data)), { slug: 'shop', change });
  }
});

test('another event, an unknown change or a bad payload is none', () => {
  const good = JSON.stringify({ slug: 'shop', change: 'deleted' });
  assert.equal(draftsEventOf(event(good, 'job')), undefined);
  assert.equal(draftsEventOf(event('{"slug":"shop","change":"moved"}')), undefined);
  assert.equal(draftsEventOf(event('{"slug":7,"change":"deleted"}')), undefined);
  for (const data of ['', 'not json', 'null', '[]', '"shop"']) {
    assert.equal(draftsEventOf(event(data)), undefined, data);
  }
});

test('the gallery looks again at any change; a draft page only at its own', () => {
  const shop: DraftsChange = { slug: 'shop', change: 'deleted' };
  const cart: DraftsChange = { slug: 'cart', change: 'deleted' };
  assert.equal(needsLook(shop, { kind: 'gallery' }), true);
  assert.equal(needsLook(cart, { kind: 'gallery' }), true);
  assert.equal(needsLook(shop, { kind: 'draft', slug: 'shop' }), true);
  assert.equal(needsLook(cart, { kind: 'draft', slug: 'shop' }), false);
  assert.equal(
    needsLook({ slug: 'shop', change: 'restored' }, { kind: 'gone', slug: 'shop' }),
    true,
  );
  assert.equal(
    needsLook({ slug: 'cart', change: 'restored' }, { kind: 'gone', slug: 'shop' }),
    false,
  );
});

test('a change the page made itself is told once, and a failed one is forgotten', () => {
  const now = 1000;
  const own = createOwn(() => now);
  const deleted: DraftsChange = { slug: 'shop', change: 'deleted' };
  const restored: DraftsChange = { slug: 'shop', change: 'restored' };
  assert.equal(own.take(deleted), false, 'nothing was marked');
  own.mark(deleted);
  assert.equal(own.take(restored), false, 'another change of the same draft is not it');
  assert.equal(own.take(deleted), true);
  assert.equal(own.take(deleted), false, 'told once');
  own.mark(deleted);
  own.drop(deleted);
  assert.equal(own.take(deleted), false);
});

test('a mark that waited too long for its event is no longer the page own', () => {
  let now = 0;
  const own = createOwn(() => now);
  const deleted: DraftsChange = { slug: 'shop', change: 'deleted' };
  own.mark(deleted);
  now = OWN_MS + 1;
  assert.equal(own.take(deleted), false);
});
