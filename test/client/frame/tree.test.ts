import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_NAME,
  MAX_NODES,
  MAX_STYLE_VALUE,
  parseEditFrame,
} from '../../../client/channel/edit-protocol.ts';
import {
  buildTree,
  nameOf,
  type RawNode,
  readStyles,
  STYLE_PROPERTIES,
} from '../../../client/frame/tree.ts';
import { STYLE_PROPERTIES as SERVER_PROPERTIES } from '../../../src/edit/index.ts';

type Fields = {
  id?: string;
  tag?: string;
  label?: string | null;
  heading?: string | null;
  text?: string | null;
  ancestors?: string[];
};

const raw = (fields: Fields = {}): RawNode => ({
  id: fields.id ?? 'sections/Hero:section',
  tag: fields.tag ?? 'DIV',
  label: fields.label ?? null,
  heading: () => fields.heading ?? null,
  text: () => fields.text ?? null,
  ancestors: () => fields.ancestors ?? [],
});

test('an aria-label names the element before anything else', () => {
  const name = nameOf(raw({ label: ' Main  menu ', heading: 'Shop', text: 'Shop now' }));
  assert.equal(name, 'Main menu');
});

test('without a label the first heading inside names the element', () => {
  const section = raw({ heading: '  Plans\n and prices ', text: 'Plans and prices Buy' });
  assert.equal(nameOf(section), 'Plans and prices');
  // A label of white space only is no label.
  assert.equal(nameOf(raw({ label: '   ', heading: 'Plans' })), 'Plans');
});

test('without a label or a heading the element is named by its own text', () => {
  assert.equal(nameOf(raw({ tag: 'BUTTON', text: '  Buy\n\t now  ' })), 'Buy now');
  assert.equal(nameOf(raw({ heading: '  ', text: 'Buy' })), 'Buy');
});

test('an element with nothing to read is named by its lower-case tag', () => {
  assert.equal(nameOf(raw({ tag: 'IMG' })), 'img');
  assert.equal(nameOf(raw({ tag: 'SECTION', label: '', heading: '', text: ' \n ' })), 'section');
});

test('a name is cut to 80 characters and never splits a surrogate pair', () => {
  assert.equal(MAX_NAME, 80);
  assert.equal(nameOf(raw({ text: 'x'.repeat(200) })), 'x'.repeat(80));
  assert.equal(nameOf(raw({ label: 'y'.repeat(81) })).length, 80);
  const smile = '\u{1F600}';
  assert.equal(nameOf(raw({ text: `${'x'.repeat(79)}${smile}` })), 'x'.repeat(79));
  // A cut that ends on a space leaves no space at the end.
  assert.equal(nameOf(raw({ text: `${'x'.repeat(79)} tail` })), 'x'.repeat(79));
});

test('the tree has one node per id, in document order', () => {
  const tree = buildTree([
    raw({ id: 'App:main', tag: 'MAIN', text: 'Shop Buy' }),
    raw({ id: 'App:main/h1', tag: 'H1', text: 'Shop', ancestors: ['App:main'] }),
    raw({ id: 'App:main/button', tag: 'BUTTON', text: 'Buy', ancestors: ['App:main'] }),
  ]);
  assert.deepEqual(tree, [
    { id: 'App:main', parent: null, name: 'Shop Buy', count: 1 },
    { id: 'App:main/h1', parent: 'App:main', name: 'Shop', count: 1 },
    { id: 'App:main/button', parent: 'App:main', name: 'Buy', count: 1 },
  ]);
});

test('an element inside a fragment hangs under the nearest element that has an id', () => {
  // <section><><p/></></section>: the fragment has no element, so `p` sits right in `section`.
  // The `div` between `p` and `span` has no id either: it is not in the list at all.
  const tree = buildTree([
    raw({ id: 'A:section', tag: 'SECTION' }),
    raw({ id: 'A:section/$/p', tag: 'P', ancestors: ['A:section'] }),
    raw({ id: 'A:section/$/p/span', tag: 'SPAN', ancestors: ['A:section/$/p', 'A:section'] }),
  ]);
  assert.deepEqual(
    tree.map((node) => [node.id, node.parent]),
    [
      ['A:section', null],
      ['A:section/$/p', 'A:section'],
      ['A:section/$/p/span', 'A:section/$/p'],
    ],
  );
});

test('the parent is the nearest enclosing element with another id', () => {
  // A component that renders itself inside itself: both roots carry the same id.
  const tree = buildTree([
    raw({ id: 'A:ul', tag: 'UL' }),
    raw({ id: 'A:ul/li', tag: 'LI', ancestors: ['A:ul'] }),
    raw({ id: 'A:ul/li', tag: 'LI', ancestors: ['A:ul/li', 'A:ul'] }),
  ]);
  assert.deepEqual(tree, [
    { id: 'A:ul', parent: null, name: 'ul', count: 1 },
    { id: 'A:ul/li', parent: 'A:ul', name: 'li', count: 2 },
  ]);
});

test('the items of a mapped list are one node, counted, named by the first', () => {
  const item = (text: string): RawNode =>
    raw({ id: 'A:ul/li', tag: 'LI', text, ancestors: ['A:ul'] });
  const tree = buildTree([
    raw({ id: 'A:ul', tag: 'UL', label: 'Plans' }),
    item('Free'),
    raw({ id: 'A:ul/li/b', tag: 'B', text: 'Free', ancestors: ['A:ul/li', 'A:ul'] }),
    item('Team'),
    raw({ id: 'A:ul/li/b', tag: 'B', text: 'Team', ancestors: ['A:ul/li', 'A:ul'] }),
    item('Company'),
    raw({ id: 'A:footer', tag: 'FOOTER' }),
  ]);
  assert.deepEqual(tree, [
    { id: 'A:ul', parent: null, name: 'Plans', count: 1 },
    { id: 'A:ul/li', parent: 'A:ul', name: 'Free', count: 3 },
    { id: 'A:ul/li/b', parent: 'A:ul/li', name: 'Free', count: 2 },
    { id: 'A:footer', parent: null, name: 'footer', count: 1 },
  ]);
});

test('a name is read only for the first element of an id', () => {
  let reads = 0;
  const counted = (): RawNode => ({
    ...raw({ id: 'A:li' }),
    text: () => {
      reads += 1;
      return 'Item';
    },
  });
  buildTree([counted(), counted(), counted()]);
  assert.equal(reads, 1);
});

test('an id the studio would refuse is left out, and its children hang one level up', () => {
  const tree = buildTree([
    raw({ id: 'A:main', tag: 'MAIN' }),
    raw({ id: 'bad id"', tag: 'DIV', ancestors: ['A:main'] }),
    raw({ id: 'A:main/p', tag: 'P', ancestors: ['bad id"', 'A:main'] }),
    raw({ id: '', tag: 'DIV' }),
  ]);
  assert.deepEqual(
    tree.map((node) => [node.id, node.parent]),
    [
      ['A:main', null],
      ['A:main/p', 'A:main'],
    ],
  );
});

test('the tree stops at the limit of nodes and the studio accepts it', () => {
  const many = Array.from({ length: MAX_NODES + 5 }, (_, index) => raw({ id: `A:div/${index}` }));
  const tree = buildTree([...many, raw({ id: 'A:div/0' })]);
  assert.equal(tree.length, MAX_NODES);
  // Elements past the limit still count for the nodes that are in.
  assert.equal(tree[0]?.count, 2);
  const message = { type: 'tree', request: 1, nodes: tree };
  assert.ok(parseEditFrame(message, 'probe'));
});

test('the property list equals the one the server edits', () => {
  assert.deepEqual([...STYLE_PROPERTIES], [...SERVER_PROPERTIES]);
});

test('styles carry every listed property, trimmed and cut to the limit', () => {
  const styles = readStyles((name) => (name === 'gap' ? ' 16px ' : 'v'.repeat(300)));
  assert.deepEqual(Object.keys(styles), [...STYLE_PROPERTIES]);
  assert.equal(styles.gap, '16px');
  assert.equal(styles.color?.length, MAX_STYLE_VALUE);
  const message = { type: 'inspected', request: 2, id: 'A:main', found: true, styles };
  assert.ok(parseEditFrame(message, 'probe'));
});
