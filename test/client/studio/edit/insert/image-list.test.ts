// The draft's images in the Insert tab: their order, where a thumbnail loads from, what a click writes.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  orderImages,
  pickOps,
  thumbnailUrl,
} from '../../../../../client/studio/edit/insert/image-list.ts';
import { STYLE_PROPERTIES } from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Hero:section/div';
const ETAG = `"${'a'.repeat(27)}"`;

function inspected(overrides: Partial<Inspect> = {}): Inspect {
  const styles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [property, { kind: 'kit' }]),
  ) as Inspect['styles'];
  return {
    id: ID,
    version: 1,
    hash: '0123456789abcdef',
    movable: null,
    file: 'src/tsx/sections/Hero.tsx',
    etag: ETAG,
    tag: 'div',
    component: null,
    props: [],
    spread: false,
    text: null,
    textRefusal: null,
    className: { kind: 'string', value: 'hero' },
    styleClass: { className: 'hero', exists: true },
    scss: {
      file: 'src/scss/sections/hero.scss',
      etag: ETAG,
      rule: true,
      declarations: [],
      nested: [],
    },
    styles,
    images: ['hero.png'],
    ...overrides,
  };
}

const FRAME = 'http://127.0.0.1:4100/f/key123/shop/v2/html/index.html?state=default&channel=abc';

test('a thumbnail is loaded from the img folder beside the lead frame page', () => {
  assert.equal(
    thumbnailUrl(FRAME, 'hero.png'),
    'http://127.0.0.1:4100/f/key123/shop/v2/img/hero.png',
  );
});

test('a file name is encoded in the thumbnail address', () => {
  assert.equal(
    thumbnailUrl(FRAME, 'a b#.png'),
    'http://127.0.0.1:4100/f/key123/shop/v2/img/a%20b%23.png',
  );
});

test('an address that is not a built draft page gets no thumbnail', () => {
  assert.equal(thumbnailUrl('', 'hero.png'), null);
  assert.equal(thumbnailUrl('about:blank', 'hero.png'), null);
  assert.equal(thumbnailUrl('http://127.0.0.1:4100/f/key123/shop/v2/js/index.js', 'a.png'), null);
});

test('images are listed by name and the given list is left as it was', () => {
  const given = ['b.png', 'a-2.png', 'a.png'];
  assert.deepEqual(orderImages(given), ['a-2.png', 'a.png', 'b.png']);
  assert.deepEqual(given, ['b.png', 'a-2.png', 'a.png']);
});

test('a click on an element that takes src writes the src, as a drop does', () => {
  const picked = pickOps(inspected({ tag: 'img', props: [] }), 'hero.png', 'scss');
  assert.equal(picked.kind, 'ops');
  if (picked.kind !== 'ops') return;
  assert.equal(picked.ops[0]?.op, 'setProp');
  assert.deepEqual(picked.label, { key: 'upload.drop.src', params: { file: 'hero.png' } });
});

test('a click on an element that takes no src writes its background image', () => {
  const picked = pickOps(inspected(), 'hero.png', 'scss');
  assert.equal(picked.kind, 'ops');
  if (picked.kind !== 'ops') return;
  assert.deepEqual(picked.label, { key: 'upload.drop.background', params: { file: 'hero.png' } });
});

test('a click on an element that can show no image writes nothing and says why', () => {
  const sealed = inspected({
    tag: 'Card',
    component: { name: 'Card', takesClassName: false, props: [] },
  });
  assert.deepEqual(pickOps(sealed, 'hero.png', 'scss'), {
    kind: 'refused',
    key: 'upload.drop.backgroundFixed',
  });
});

test('a click with nothing selected writes nothing and asks for a selection', () => {
  assert.deepEqual(pickOps(null, 'hero.png', 'scss'), {
    kind: 'refused',
    key: 'images.selectFirst',
  });
});
