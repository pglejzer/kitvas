import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clickTarget,
  codeOf,
  dropOp,
  filterPalette,
  type Item,
  iconCode,
  opFor,
  type PaletteComponent,
} from '../../../client/studio/edit/palette.ts';
import type { Palette, Structure } from '../../../src/studio/api/structure-schemas.ts';

const HASH = '0123456789abcdef';
type Entry = Structure['elements'][number];

function entry(id: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    file: 'src/tsx/sections/Hero.tsx',
    line: 1,
    column: 1,
    tag: 'div',
    parent: null,
    hash: HASH,
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
const STACK = `${ROOT}/Stack`;
const CARD = `${STACK}/Card`;
const HEADER = `${CARD}/Card.Header`;
const OTHER_ROOT = 'sections/OrderSummary:section';

const structure: Structure = {
  version: 1,
  folder: '/d/hero/v1',
  etags: {},
  elements: [
    entry(ROOT, { tag: 'section', root: 'section' }),
    entry(STACK, { parent: ROOT, tag: 'Stack', component: 'Stack' }),
    entry(CARD, { parent: STACK, tag: 'Card', component: 'Card' }),
    entry(HEADER, { parent: CARD, tag: 'Card.Header' }),
    entry(OTHER_ROOT, {
      file: 'src/tsx/sections/OrderSummary.tsx',
      tag: 'section',
      root: 'section',
    }),
  ],
  sections: [
    { id: 'hero', element: null, purpose: 'Say hello.' },
    { id: 'order-summary', element: null, purpose: 'Pay.' },
  ],
};

function component(name: string, overrides: Partial<PaletteComponent> = {}): PaletteComponent {
  return {
    name,
    category: 'layout',
    parent: null,
    accepts: true,
    required: [],
    examples: [],
    ...overrides,
  };
}

const button = component('Button', {
  category: 'action',
  examples: [{ title: 'Primary', code: '<Button>Save</Button>', imports: ['Button'] }],
});
const input = component('Input', { category: 'input', accepts: false, required: ['label'] });
const card = component('Card');
const header = component('Card.Header', { parent: 'Card' });

const palette: Palette = {
  components: [button, input, card, header],
  icons: { component: 'Icon', names: ['check', 'close', 'search'] },
  sections: [
    { slug: 'landing', section: 'pricing', purpose: 'Show the plans.' },
    { slug: 'landing', section: 'faq', purpose: 'Answer questions.' },
  ],
};

test('an empty search keeps everything', () => {
  const all = filterPalette(palette, '  ');
  assert.equal(all.components.length, 4);
  assert.deepEqual(all.icons, ['check', 'close', 'search']);
  assert.equal(all.sections.length, 2);
});

test('search matches names, categories, icon names and section purposes in every group', () => {
  assert.deepEqual(
    filterPalette(palette, 'BUT').components.map((c) => c.name),
    ['Button'],
  );
  assert.deepEqual(
    filterPalette(palette, 'input').components.map((c) => c.name),
    ['Input'],
  );
  assert.deepEqual(filterPalette(palette, 'che').icons, ['check']);
  assert.deepEqual(
    filterPalette(palette, 'plans').sections.map((s) => s.section),
    ['pricing'],
  );
});

test('a part shows when its root matches, and a part alone shows without its root', () => {
  assert.deepEqual(
    filterPalette(palette, 'card').components.map((c) => c.name),
    ['Card', 'Card.Header'],
  );
  assert.deepEqual(
    filterPalette(palette, 'header').components.map((c) => c.name),
    ['Card.Header'],
  );
});

test('a component inserts as its first example, else bare, else not at all', () => {
  assert.equal(codeOf(button), '<Button>Save</Button>');
  assert.equal(codeOf(card), '<Card></Card>');
  assert.equal(codeOf(component('Divider', { accepts: false })), '<Divider />');
  assert.equal(codeOf(input), null);
  assert.equal(iconCode('Icon', 'chevron-down'), '<Icon name="chevron-down" />');
  assert.equal(iconCode('Icon', 'a"b'), null);
});

test('a click inserts after the selected element', () => {
  const op = opFor({ kind: 'component', component: button }, structure, null, [CARD]);
  assert.deepEqual(op, {
    op: 'insertElement',
    anchor: CARD,
    place: 'after',
    source: '<Button>Save</Button>',
  });
});

test('a click on a section root inserts last inside it, never after it', () => {
  assert.deepEqual(clickTarget(structure, [ROOT], null), { anchor: ROOT, place: 'last' });
});

test('with nothing selected a click inserts last in the first section root', () => {
  assert.deepEqual(clickTarget(structure, [], null), { anchor: ROOT, place: 'last' });
});

test('a click after an element inside an expression has no target', () => {
  const inList: Structure = {
    ...structure,
    elements: [...structure.elements, entry('x', { movable: 'in-expression' })],
  };
  assert.equal(clickTarget(inList, ['x'], null), 'noTarget');
});

test('a part inserts last inside the nearest selected root, found through the parents', () => {
  const item: Item = { kind: 'component', component: header };
  assert.deepEqual(opFor(item, structure, null, [HEADER]), {
    op: 'insertElement',
    anchor: CARD,
    place: 'last',
    source: '<Card.Header></Card.Header>',
  });
  assert.equal(opFor(item, structure, null, [STACK]), 'partOnly');
  assert.equal(opFor(item, structure, null, []), 'partOnly');
});

test('a component that needs props is not inserted', () => {
  const item: Item = { kind: 'component', component: input };
  assert.equal(opFor(item, structure, null, [CARD]), 'needsProps');
});

test('an icon inserts the icon component with its name', () => {
  const op = opFor({ kind: 'icon', component: 'Icon', name: 'check' }, structure, null, [CARD]);
  assert.deepEqual(op, {
    op: 'insertElement',
    anchor: CARD,
    place: 'after',
    source: '<Icon name="check" />',
  });
});

test('a section click goes after the selected section, else last', () => {
  const item: Item = { kind: 'section', slug: 'landing', section: 'pricing', purpose: '' };
  const from = { slug: 'landing', section: 'pricing' };
  assert.deepEqual(opFor(item, structure, null, [CARD]), {
    op: 'insertSection',
    from,
    after: 'hero',
  });
  assert.deepEqual(opFor(item, structure, null, []), {
    op: 'insertSection',
    from,
    after: 'order-summary',
  });
});

test('a drop sends the insert at the slot of the frame', () => {
  const item: Item = { kind: 'component', component: button };
  assert.deepEqual(dropOp(item, structure, { anchor: STACK, place: 'first' }, []), {
    op: 'insertElement',
    anchor: STACK,
    place: 'first',
    source: '<Button>Save</Button>',
  });
});

test('a section dropped before a section goes after the one above it, or first', () => {
  const item: Item = { kind: 'section', slug: 'landing', section: 'faq', purpose: '' };
  const from = { slug: 'landing', section: 'faq' };
  assert.deepEqual(dropOp(item, structure, { anchor: OTHER_ROOT, place: 'before' }, []), {
    op: 'insertSection',
    from,
    after: 'hero',
  });
  assert.deepEqual(dropOp(item, structure, { anchor: ROOT, place: 'before' }, []), {
    op: 'insertSection',
    from,
    after: null,
  });
  assert.deepEqual(dropOp(item, structure, { anchor: ROOT, place: 'after' }, []), {
    op: 'insertSection',
    from,
    after: 'hero',
  });
});

test('a part dropped outside its root is not inserted', () => {
  const item: Item = { kind: 'component', component: header };
  assert.equal(dropOp(item, structure, { anchor: STACK, place: 'last' }, []), null);
  assert.deepEqual(dropOp(item, structure, { anchor: CARD, place: 'first' }, []), {
    op: 'insertElement',
    anchor: CARD,
    place: 'first',
    source: '<Card.Header></Card.Header>',
  });
  assert.notEqual(dropOp(item, structure, { anchor: HEADER, place: 'after' }, []), null);
});
