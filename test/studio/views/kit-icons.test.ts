import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Previews } from '../../../src/studio/api/edit/structure-schemas.ts';
import { NO_PREVIEWS } from '../../../src/studio/previews/answer.ts';
import { iconsView } from '../../../src/studio/views/kit-icons.ts';

const SRC = 'http://127.0.0.1:5001/k/k3y/kitvas-ui/previews/v2-0123456789abcdef/icons.png';

const previews = (fields: Partial<Previews> = {}): Previews => ({
  state: 'ready',
  backdrop: '#e4e6ea',
  components: {},
  icons: { src: SRC, cell: 32, columns: 2, names: ['plus', 'cart', 'bell'] },
  ...fields,
});

test('an icon of the sheet is drawn from its cell, in the order of the sheet', () => {
  const view = iconsView(['plus', 'cart', 'bell'], previews());
  assert.deepEqual(view.rows, [
    { name: 'plus', drawn: true },
    { name: 'cart', drawn: true },
    { name: 'bell', drawn: true },
  ]);
  assert.equal(view.coming, false);
  assert.deepEqual(view.rules.split('\n'), [
    `.kit-glyph { background-image: url("${SRC}"); background-size: 64px auto; }`,
    '.kit-glyph-tile { background: #e4e6ea; }',
    '.kit-glyph[data-icon="plus"] { background-position: 0px 0px; }',
    '.kit-glyph[data-icon="cart"] { background-position: -32px 0px; }',
    '.kit-glyph[data-icon="bell"] { background-position: 0px -32px; }',
  ]);
});

test('a sheet of another cell size is drawn at the size of the page own box', () => {
  const sheet = { src: SRC, cell: 48, columns: 3, names: ['plus', 'cart', 'bell', 'home'] };
  const rules = iconsView(['home'], previews({ icons: sheet })).rules;
  assert.ok(rules.includes('background-size: 96px auto;'));
  assert.ok(rules.includes('.kit-glyph[data-icon="home"] { background-position: 0px -32px; }'));
});

test('a name the sheet does not hold shows without a picture', () => {
  const view = iconsView(['plus', 'star'], previews());
  assert.deepEqual(view.rows, [
    { name: 'plus', drawn: true },
    { name: 'star', drawn: false },
  ]);
});

test('an unknown backdrop leaves the tile its own ground', () => {
  assert.ok(!iconsView(['plus'], previews({ backdrop: null })).rules.includes('.kit-glyph-tile'));
});

test('without a sheet every name shows alone and the page has no rule', () => {
  const view = iconsView(['plus', 'cart'], NO_PREVIEWS);
  assert.deepEqual(view, {
    rows: [
      { name: 'plus', drawn: false },
      { name: 'cart', drawn: false },
    ],
    rules: '',
    coming: false,
  });
});

test('pictures are coming only while a job makes the first ones', () => {
  assert.equal(iconsView(['plus'], { ...NO_PREVIEWS, state: 'making' }).coming, true);
  // Earlier pictures stay on the page while new ones are made.
  assert.equal(iconsView(['plus'], previews({ state: 'making' })).coming, false);
  assert.equal(iconsView([], { ...NO_PREVIEWS, state: 'making' }).coming, false);
});

test('nothing of the sheet can end the string, the selector or the style block', () => {
  for (const src of [`${SRC}"`, `${SRC}\\`, 'x</style>', 'a b', 'a\nb']) {
    const sheet = { src, cell: 32, columns: 2, names: ['plus'] };
    const view = iconsView(['plus'], previews({ icons: sheet }));
    assert.equal(view.rules, '', src);
    assert.deepEqual(view.rows, [{ name: 'plus', drawn: false }]);
  }
  const names = ['plus', 'a"] { } x', 'plus', 'cart'];
  const view = iconsView(names, previews({ icons: { src: SRC, cell: 32, columns: 4, names } }));
  assert.ok(!view.rules.includes('a"]'));
  // A name left out keeps its cell: the next one is still cut from its own.
  assert.ok(
    view.rules.includes('.kit-glyph[data-icon="cart"] { background-position: -96px 0px; }'),
  );
  assert.equal(view.rules.match(/data-icon="plus"/g)?.length, 1, 'a name met twice is drawn once');
  assert.deepEqual(
    view.rows.map((row) => row.drawn),
    [true, false, true, true],
  );
});
