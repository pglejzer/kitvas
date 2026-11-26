import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../../../../../../client/channel/edit-protocol.ts';
import {
  crumbsOf,
  kindOf,
  neighboursOf,
  placeOf,
} from '../../../../../../client/studio/edit/props/panel/header.ts';
import type { Structure } from '../../../../../../src/studio/api/edit/structure-schemas.ts';

const SECTION = 'sections/Hero:section';
const STACK = 'sections/Hero:section/Stack';
const TITLE = 'sections/Hero:section/Stack/Heading';
const BUTTON = 'sections/Hero:section/Stack/Button';

type Entry = Structure['elements'][number];

function entry(id: string, tag: string, parent: string | null): Entry {
  return {
    id,
    file: 'src/tsx/sections/Hero.tsx',
    line: 1,
    column: 1,
    tag,
    parent,
    hash: '0123456789abcdef',
    text: null,
    props: [],
    component: null,
    movable: null,
    accepts: true,
    mixed: false,
    interactive: false,
    root: null,
  };
}

const structure: Structure = {
  version: 2,
  folder: 'C:/drafts/shop/v2',
  etags: {},
  elements: [
    entry(SECTION, 'section', null),
    entry(STACK, 'Stack', SECTION),
    entry(TITLE, 'Heading', STACK),
    entry(BUTTON, 'Button', STACK),
  ],
  sections: [],
};

const node = (id: string, parent: string | null): TreeNode => ({ id, parent, name: id, count: 1 });

test('the crumbs are the parents from the outermost in, named by their tags', () => {
  assert.deepEqual(crumbsOf({ structure, tree: [] }, TITLE), [
    { id: SECTION, label: 'section' },
    { id: STACK, label: 'Stack' },
  ]);
  assert.deepEqual(crumbsOf({ structure, tree: [] }, SECTION), []);
});

test('without the structure the crumbs come from the frame tree and the ids', () => {
  const tree = [node(SECTION, null), node(STACK, SECTION), node(TITLE, STACK)];
  assert.deepEqual(crumbsOf({ structure: null, tree }, TITLE), [
    { id: SECTION, label: 'section' },
    { id: STACK, label: 'Stack' },
  ]);
});

test('a loop in the data ends the crumbs instead of running forever', () => {
  const tree = [node(STACK, TITLE), node(TITLE, STACK)];
  assert.deepEqual(crumbsOf({ structure: null, tree }, TITLE), [{ id: STACK, label: 'Stack' }]);
});

test('the parent and first child buttons point at the neighbours, or nowhere', () => {
  assert.deepEqual(neighboursOf({ structure, tree: [] }, STACK), {
    parent: SECTION,
    child: TITLE,
  });
  assert.deepEqual(neighboursOf({ structure, tree: [] }, BUTTON), { parent: STACK, child: null });
  assert.deepEqual(neighboursOf({ structure, tree: [] }, SECTION), {
    parent: null,
    child: STACK,
  });
  const tree = [node(SECTION, null), node(STACK, SECTION)];
  assert.deepEqual(neighboursOf({ structure: null, tree }, SECTION), {
    parent: null,
    child: STACK,
  });
});

test('the kind chip and the place of the element', () => {
  assert.equal(kindOf({ component: null }), 'html');
  const component = { name: 'Stack', takesClassName: true, props: [] };
  assert.equal(kindOf({ component }), 'kit');
  const file = 'src/tsx/sections/Hero.tsx';
  assert.equal(placeOf({ file, line: 12 }), `${file}:12`);
  assert.equal(placeOf({ file }), file);
});
