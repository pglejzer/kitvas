import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupByCategory, groupTitle } from '../../../../../client/studio/edit/insert/groups.ts';
import {
  clickTarget,
  opFor,
  type PaletteComponent,
} from '../../../../../client/studio/edit/insert/palette.ts';
import type { Structure } from '../../../../../src/studio/api/edit/structure-schemas.ts';

type Entry = Structure['elements'][number];

function entry(id: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    file: 'src/tsx/sections/Hero.tsx',
    line: 1,
    column: 1,
    tag: 'div',
    parent: null,
    hash: '0123456789abcdef',
    text: null,
    props: [],
    component: null,
    movable: null,
    accepts: true,
    mixed: false,
    interactive: false,
    root: null,
    ...overrides,
  };
}

const ROOT = 'sections/Hero:section';
const CARD = `${ROOT}/Card`;
const TEXT = `${CARD}/Text`;

const structure: Structure = {
  version: 1,
  folder: '/d/hero/v1',
  etags: {},
  elements: [
    entry(ROOT, { tag: 'section', root: 'section' }),
    entry(CARD, { parent: ROOT, tag: 'Card', component: 'Card' }),
    entry(TEXT, { parent: CARD, tag: 'Text', accepts: false }),
  ],
  sections: [
    { id: 'hero', element: null, purpose: 'Say hello.' },
    { id: 'pricing', element: null, purpose: 'Plans.' },
  ],
};

const button: PaletteComponent = {
  name: 'Button',
  category: 'action',
  parent: null,
  accepts: true,
  required: [],
  examples: [{ title: 'Primary', code: '<Button>Save</Button>', imports: ['Button'] }],
};

test('after is what a click did before the choice existed', () => {
  assert.deepEqual(clickTarget(structure, [CARD], null), { anchor: CARD, place: 'after' });
  assert.deepEqual(clickTarget(structure, [CARD], null, 'after'), { anchor: CARD, place: 'after' });
  assert.deepEqual(clickTarget(structure, [ROOT], null, 'after'), { anchor: ROOT, place: 'last' });
});

test('before puts it in front of the selected element, and a root has no front', () => {
  assert.deepEqual(clickTarget(structure, [CARD], null, 'before'), {
    anchor: CARD,
    place: 'before',
  });
  assert.equal(clickTarget(structure, [ROOT], null, 'before'), 'noTarget');
});

test('inside puts it last in an element that takes children, and nowhere else', () => {
  assert.deepEqual(clickTarget(structure, [CARD], null, 'inside'), { anchor: CARD, place: 'last' });
  assert.equal(clickTarget(structure, [TEXT], null, 'inside'), 'noTarget');
});

test('the choice reaches the op a click inserts', () => {
  const item = { kind: 'component' as const, component: button };
  assert.deepEqual(opFor(item, structure, null, [CARD], 'before'), {
    op: 'insertElement',
    anchor: CARD,
    place: 'before',
    source: '<Button>Save</Button>',
  });
});

test('a section goes in front of the one the selection is in when the choice is before', () => {
  const item = { kind: 'section' as const, slug: 'landing', section: 'faq', purpose: 'Answers.' };
  const asBefore = opFor(item, structure, null, [ROOT], 'before');
  const asAfter = opFor(item, structure, null, [ROOT], 'after');
  assert.deepEqual(asBefore, {
    op: 'insertSection',
    from: { slug: 'landing', section: 'faq' },
    after: null,
  });
  assert.ok(typeof asAfter !== 'string' && asAfter.op === 'insertSection');
});

test('components group by category in the order the kit lists them', () => {
  const groups = groupByCategory(
    [
      { name: 'Button', category: 'action' },
      { name: 'Input', category: 'input' },
      { name: 'Link', category: 'action' },
      { name: 'Divider', category: '' },
    ],
    'Components',
  );
  assert.deepEqual(
    groups.map((group) => [group.category, group.items.map((item) => item.name)]),
    [
      ['action', ['Button', 'Link']],
      ['input', ['Input']],
      ['Components', ['Divider']],
    ],
  );
  assert.deepEqual(groupByCategory([], 'Components'), []);
});

test('a group is named like the pane’s other headings: its first letter is a capital', () => {
  assert.equal(groupTitle('layout'), 'Layout');
  assert.equal(groupTitle(' data display '), 'Data display');
  assert.equal(groupTitle('Components'), 'Components');
  assert.equal(groupTitle(''), '');
});
