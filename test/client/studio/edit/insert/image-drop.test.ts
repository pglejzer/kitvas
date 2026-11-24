// What a dropped image does to the element it lands on (spec 4c, goal 10).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  carriesFiles,
  imageDropOps,
  srcOf,
  takesSrc,
} from '../../../../../client/studio/edit/insert/image-drop.ts';
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

const image = (props: { name: string; type: string }[]): Inspect['component'] => ({
  name: 'Image',
  takesClassName: true,
  props,
});

test('an img takes the file as its src, written relative to the page', () => {
  const drop = imageDropOps(
    inspected({
      tag: 'img',
      props: [{ name: 'src', kind: 'literal', value: { kind: 'string', value: '../img/old.png' } }],
    }),
    'hero.png',
    'scss',
  );
  assert.equal(drop.kind, 'ops');
  if (drop.kind !== 'ops') return;
  assert.deepEqual(drop.ops, [
    {
      op: 'setProp',
      id: ID,
      name: 'src',
      value: { kind: 'string', value: '../img/hero.png' },
      before: { kind: 'string', value: '../img/old.png' },
      after: null,
    },
  ]);
  assert.deepEqual(drop.label, { key: 'upload.drop.src', params: { file: 'hero.png' } });
});

test('a kit component with a src prop gets the file as its src, an img without one too', () => {
  const component = image([{ name: 'src', type: 'string' }]);
  assert.equal(takesSrc(inspected({ tag: 'Image', component })), true);
  const drop = imageDropOps(inspected({ tag: 'Image', component }), 'hero.png', 'scss');
  assert.equal(drop.kind, 'ops');
  if (drop.kind === 'ops') {
    assert.deepEqual(
      drop.ops.map((op) => [op.op, 'name' in op ? op.name : null, 'id' in op ? op.id : null]),
      [['setProp', 'src', ID]],
    );
  }
  const bare = imageDropOps(inspected({ tag: 'img' }), 'hero.png', 'scss');
  assert.equal(bare.kind, 'ops');
});

test('any other element gets the file as its background image, as an unmarked value', () => {
  assert.equal(takesSrc(inspected()), false);
  assert.equal(takesSrc(inspected({ tag: 'Card', component: image([]) })), false);
  const drop = imageDropOps(inspected(), 'hero.png', 'scss');
  assert.equal(drop.kind, 'ops');
  if (drop.kind !== 'ops') return;
  assert.deepEqual(drop.ops, [
    {
      op: 'setStyle',
      id: ID,
      className: 'hero',
      property: 'background-image',
      value: { raw: 'url(../img/hero.png)', mark: false },
      before: null,
      newRule: false,
    },
  ]);
  assert.deepEqual(drop.label, { key: 'upload.drop.background', params: { file: 'hero.png' } });
});

test('an element with no class gets one before its background is written', () => {
  const drop = imageDropOps(
    inspected({
      className: null,
      styleClass: { className: 'hero-box', exists: false },
      scss: {
        file: 'src/scss/sections/hero.scss',
        etag: ETAG,
        rule: false,
        declarations: [],
        nested: [],
      },
    }),
    'hero.png',
    'scss',
  );
  assert.equal(drop.kind, 'ops');
  if (drop.kind === 'ops') {
    assert.deepEqual(
      drop.ops.map((op) => op.op),
      ['addClass', 'setStyle'],
    );
  }
});

test('an expression src and a component that takes no class say why nothing was written', () => {
  const expr = imageDropOps(
    inspected({ tag: 'img', props: [{ name: 'src', kind: 'expr', source: 'url' }] }),
    'hero.png',
    'scss',
  );
  assert.deepEqual(expr, { kind: 'refused', key: 'upload.drop.srcFixed' });
  const sealed = imageDropOps(
    inspected({ tag: 'Card', component: { name: 'Card', takesClassName: false, props: [] } }),
    'hero.png',
    'scss',
  );
  assert.deepEqual(sealed, { kind: 'refused', key: 'upload.drop.backgroundFixed' });
});

test('a file the version does not list is not written as a background', () => {
  const drop = imageDropOps(inspected({ images: [] }), 'hero.png', 'scss');
  assert.deepEqual(drop, { kind: 'refused', key: 'upload.drop.backgroundFixed' });
});

test('the src of a file is relative to the page', () => {
  assert.equal(srcOf('hero.png'), '../img/hero.png');
});

test('only a drag that carries files is an image drag', () => {
  assert.equal(carriesFiles(['Files']), true);
  assert.equal(carriesFiles(['text/plain', 'Files']), true);
  assert.equal(carriesFiles(['text/plain', 'text/uri-list']), false);
  assert.equal(carriesFiles([]), false);
});
