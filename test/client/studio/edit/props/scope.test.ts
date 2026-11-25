import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CopyRef } from '../../../../../client/channel/edit-protocol.ts';
import {
  itemReread,
  itemTargetOf,
  refusedScope,
  switchCountOf,
} from '../../../../../client/studio/edit/props/scope.ts';
import { STYLE_PROPERTIES } from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Pricing:section/Card';
const ETAG = `"${'a'.repeat(27)}"`;

function inspected(overrides: Partial<Inspect> = {}): Inspect {
  const styles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [property, { kind: 'kit' }]),
  ) as Inspect['styles'];
  return {
    id: ID,
    version: 2,
    hash: '0123456789abcdef',
    movable: null,
    file: 'src/tsx/sections/Pricing.tsx',
    etag: ETAG,
    tag: 'div',
    component: null,
    props: [],
    spread: false,
    text: null,
    textRefusal: null,
    className: null,
    styleClass: { className: 'plans__card', exists: true },
    scss: null,
    styles,
    ...overrides,
  };
}

const LIST: Inspect['list'] = { kind: 'literal', count: 3, reason: null };

test('"This item" is for the one chosen copy: its path, else its place', () => {
  const pro: CopyRef = { id: ID, item: 1 };
  assert.deepEqual(itemTargetOf({ selection: [ID], copies: [pro] }), { path: [1], item: 1 });
  const inner: CopyRef = { id: ID, item: 0, path: [2, 0] };
  assert.deepEqual(itemTargetOf({ selection: [ID], copies: [inner] }), { path: [2, 0], item: 0 });
  assert.equal(itemTargetOf({ selection: [ID], copies: [] }), null);
  assert.equal(itemTargetOf({ selection: [ID], copies: [pro, { id: ID, item: 2 }] }), null);
  assert.equal(itemTargetOf({ selection: [ID, 'other'], copies: [pro] }), null);
});

test('the switch counts a literal list of one SCSS element, and a refusal is read back', () => {
  assert.equal(switchCountOf(inspected({ list: LIST }), 1, 'scss'), 3);
  assert.equal(switchCountOf(inspected({ list: LIST }), 2, 'scss'), null);
  assert.equal(switchCountOf(inspected(), 1, 'scss'), null);
  assert.equal(refusedScope(inspected({ itemScope: { refused: 'item-key' } })), 'item-key');
  const own = { className: 'plans__card--pro', inTsx: false, path: [1] };
  assert.equal(refusedScope(inspected({ itemScope: own })), null);
  assert.equal(refusedScope(inspected()), null);
});

test('in "This item" a lost copy goes back to every item, and a plain answer is read again', () => {
  const pro: CopyRef = { id: ID, item: 1 };
  const own = inspected({
    itemScope: { className: 'plans__card--pro', inTsx: true, path: [1] },
  });
  const base = { selection: [ID], copies: [pro], inspected: own };
  // Nothing changed that the scope reads: no read.
  assert.deepEqual(itemReread(base, base), { scope: 'item', read: false });
  // The copy is gone: every item, read again.
  assert.deepEqual(itemReread({ ...base, copies: [] }, base), { scope: 'all', read: true });
  // Another copy picked: still this item, read for it.
  const other = { ...base, copies: [{ id: ID, item: 2 }] };
  assert.deepEqual(itemReread(other, base), { scope: 'item', read: true });
  // A plain answer (no itemScope) for the element replaced the item one: read again, once.
  const plain = { ...base, inspected: inspected() };
  assert.deepEqual(itemReread(plain, base), { scope: 'item', read: true });
  assert.deepEqual(itemReread(plain, plain), { scope: 'item', read: false });
  // An item answer coming in never asks for another read.
  assert.deepEqual(itemReread(base, plain), { scope: 'item', read: false });
});
