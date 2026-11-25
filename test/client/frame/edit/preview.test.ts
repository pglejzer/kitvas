import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PreviewChange } from '../../../../client/channel/edit-protocol.ts';
import { createPreviewOver, type PreviewElement } from '../../../../client/frame/edit/preview.ts';

const TEXT = 3;
const ELEMENT = 1;

type FakeNode = { nodeType: number; nodeValue: string | null };

type Fake = PreviewElement & {
  childNodes: FakeNode[];
  /** The attributes as written, for the assertions. */
  attributes: Map<string, string>;
  /** What the browser paints from the inline style, whatever the attribute says. */
  painted: Map<string, string>;
};

type Start = { style?: string; class?: string; children?: FakeNode[] };

const textNode = (value: string): FakeNode => ({ nodeType: TEXT, nodeValue: value });

const parseStyle = (text: string): Map<string, string> => {
  const found = new Map<string, string>();
  for (const part of text.split(';')) {
    const at = part.indexOf(':');
    if (at > 0) found.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return found;
};

/**
 * A small element. Its inline style behaves like Chrome's: after a property is set through the
 * CSSOM, `removeAttribute('style')` alone leaves the property painted; only writing the attribute
 * takes it over again.
 */
function fake(start: Start = {}): Fake {
  const attributes = new Map<string, string>();
  let painted = new Map<string, string>();
  let viaCssom = false;
  if (start.style !== undefined) {
    attributes.set('style', start.style);
    painted = parseStyle(start.style);
  }
  if (start.class !== undefined) attributes.set('class', start.class);
  const tokens = (): string[] => (attributes.get('class') ?? '').split(/\s+/).filter(Boolean);

  return {
    childNodes: start.children ?? [],
    attributes,
    get painted() {
      return painted;
    },
    style: {
      setProperty(property, value) {
        if (value === '') painted.delete(property);
        else painted.set(property, value);
        const text = [...painted].map(([name, set]) => `${name}: ${set};`).join(' ');
        attributes.set('style', text);
        viaCssom = true;
      },
    },
    classList: {
      toggle(name, force) {
        const now = tokens();
        const on = force ?? !now.includes(name);
        const next = now.filter((token) => token !== name);
        if (on) next.push(name);
        // Like the browser: the attribute is written again from the tokens.
        attributes.set('class', next.join(' '));
        return on;
      },
    },
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute(name, value) {
      attributes.set(name, value);
      if (name !== 'style') return;
      painted = parseStyle(value);
      viaCssom = false;
    },
    removeAttribute(name) {
      attributes.delete(name);
      if (name === 'style' && !viaCssom) painted = new Map();
    },
  };
}

function page(elements: Record<string, Fake[]>) {
  return createPreviewOver((id) => elements[id] ?? []);
}

const text = (id: string, value: string): PreviewChange => ({ id, kind: 'text', value });
const style = (id: string, property: string, value: string): PreviewChange => ({
  id,
  kind: 'style',
  property,
  value,
});
const cls = (id: string, className: string, on: boolean): PreviewChange => ({
  id,
  kind: 'class',
  className,
  on,
});

test('a text preview sets the text node itself and clear puts the old text back', () => {
  const node = textNode('  Hello ');
  const element = fake({ children: [node] });
  const preview = page({ a: [element] });
  preview.apply([text('a', 'Zażółć')]);
  assert.equal(element.childNodes[0], node);
  assert.equal(node.nodeValue, 'Zażółć');
  preview.clear();
  assert.equal(element.childNodes[0], node);
  assert.equal(node.nodeValue, '  Hello ');
});

test('a text preview leaves an element whose children are not one text node', () => {
  const empty = fake();
  const mixed = fake({ children: [textNode('a'), { nodeType: ELEMENT, nodeValue: null }] });
  const nested = fake({ children: [{ nodeType: ELEMENT, nodeValue: null }] });
  const preview = page({ a: [empty, mixed, nested] });
  preview.apply([text('a', 'new')]);
  assert.equal(empty.childNodes.length, 0);
  assert.deepEqual(
    mixed.childNodes.map((node) => node.nodeValue),
    ['a', null],
  );
  assert.equal(nested.childNodes[0]?.nodeValue, null);
  preview.clear();
  assert.equal(mixed.childNodes[0]?.nodeValue, 'a');
});

test('a style preview sets the property and clear restores the attribute as written', () => {
  const element = fake({ style: 'color:red;  margin : 0' });
  const preview = page({ a: [element] });
  preview.apply([style('a', 'gap', 'var(--kit-space-md)')]);
  assert.equal(element.painted.get('gap'), 'var(--kit-space-md)');
  assert.equal(element.painted.get('color'), 'red');
  preview.clear();
  assert.equal(element.getAttribute('style'), 'color:red;  margin : 0');
  assert.deepEqual(
    [...element.painted],
    [
      ['color', 'red'],
      ['margin', '0'],
    ],
  );
});

test('clear removes a style attribute that did not exist, and nothing stays painted', () => {
  const element = fake();
  const preview = page({ a: [element] });
  preview.apply([style('a', 'gap', '13px')]);
  assert.equal(element.getAttribute('style'), 'gap: 13px;');
  preview.clear();
  assert.equal(element.getAttribute('style'), null);
  assert.equal(element.attributes.has('style'), false);
  // The fake keeps a CSSOM-set property after a bare removeAttribute, as Chrome does.
  assert.equal(element.painted.size, 0);
});

test('the fake keeps a CSSOM-set property after removeAttribute alone', () => {
  const element = fake();
  element.style.setProperty('gap', '13px');
  element.removeAttribute('style');
  assert.equal(element.painted.get('gap'), '13px');
});

test('an empty style attribute stays an empty attribute', () => {
  const element = fake({ style: '' });
  const preview = page({ a: [element] });
  preview.apply([style('a', 'gap', '13px')]);
  preview.clear();
  assert.equal(element.getAttribute('style'), '');
  assert.equal(element.painted.size, 0);
});

test('a property the element already set inline gets its own value back', () => {
  const element = fake({ style: 'gap: 4px' });
  const preview = page({ a: [element] });
  preview.apply([style('a', 'gap', '13px')]);
  assert.equal(element.painted.get('gap'), '13px');
  preview.clear();
  assert.equal(element.getAttribute('style'), 'gap: 4px');
  assert.equal(element.painted.get('gap'), '4px');
});

test('a class preview toggles the class and clear restores the attribute as written', () => {
  const element = fake({ class: ' card   wide ' });
  const preview = page({ a: [element] });
  preview.apply([cls('a', 'pricing-card', true), cls('a', 'wide', false)]);
  assert.equal(element.getAttribute('class'), 'card pricing-card');
  preview.clear();
  assert.equal(element.getAttribute('class'), ' card   wide ');
});

test('clear removes a class attribute that did not exist', () => {
  const element = fake();
  const preview = page({ a: [element] });
  preview.apply([cls('a', 'card', true)]);
  assert.equal(element.getAttribute('class'), 'card');
  preview.clear();
  assert.equal(element.attributes.has('class'), false);
});

test('a class turned off that was never there still leaves the element as it was', () => {
  const element = fake();
  const preview = page({ a: [element] });
  preview.apply([cls('a', 'card', false)]);
  preview.clear();
  assert.equal(element.attributes.has('class'), false);
});

test('applying twice keeps the first original, for text, style and classes', () => {
  const node = textNode('Hello');
  const element = fake({ style: 'color: red', children: [node] });
  const preview = page({ a: [element] });
  preview.apply([text('a', 'one'), style('a', 'gap', '4px'), cls('a', 'x', true)]);
  preview.apply([text('a', 'two'), style('a', 'gap', '8px'), cls('a', 'y', true)]);
  preview.apply([style('a', 'color', 'blue')]);
  assert.equal(node.nodeValue, 'two');
  assert.equal(element.painted.get('gap'), '8px');
  assert.equal(element.painted.get('color'), 'blue');
  assert.equal(element.getAttribute('class'), 'x y');
  preview.clear();
  assert.equal(node.nodeValue, 'Hello');
  assert.equal(element.getAttribute('style'), 'color: red');
  assert.deepEqual([...element.painted], [['color', 'red']]);
  assert.equal(element.attributes.has('class'), false);
});

test('a change goes to every item of a mapped list and each gets its own original back', () => {
  const items = [
    fake({ style: 'order: 1', class: 'item first', children: [textNode('Basic')] }),
    fake({ children: [textNode('Pro')] }),
    fake({ class: 'item', children: [textNode('Team')] }),
  ];
  const other = fake({ children: [textNode('Other')] });
  const preview = page({ item: items, other: [other] });
  preview.apply([text('item', 'Plan'), style('item', 'gap', '13px'), cls('item', 'on', true)]);
  for (const item of items) {
    assert.equal(item.childNodes[0]?.nodeValue, 'Plan');
    assert.equal(item.painted.get('gap'), '13px');
    assert.ok((item.getAttribute('class') ?? '').split(' ').includes('on'));
  }
  assert.equal(other.childNodes[0]?.nodeValue, 'Other');
  assert.equal(other.attributes.size, 0);
  preview.clear();
  assert.deepEqual(
    items.map((item) => item.childNodes[0]?.nodeValue),
    ['Basic', 'Pro', 'Team'],
  );
  assert.deepEqual(
    items.map((item) => item.getAttribute('style')),
    ['order: 1', null, null],
  );
  assert.deepEqual(
    items.map((item) => item.getAttribute('class')),
    ['item first', null, 'item'],
  );
  assert.ok(items.every((item) => !item.painted.has('gap')));
});

test('only what a preview touched is written back', () => {
  const element = fake({ style: 'color: red', class: 'card', children: [textNode('Hello')] });
  const preview = page({ a: [element] });
  preview.apply([text('a', 'new')]);
  // The page itself changes the element meanwhile; a text preview has no say over these.
  element.setAttribute('style', 'color: blue');
  element.setAttribute('class', 'card open');
  preview.clear();
  assert.equal(element.childNodes[0]?.nodeValue, 'Hello');
  assert.equal(element.getAttribute('style'), 'color: blue');
  assert.equal(element.getAttribute('class'), 'card open');
});

test('clear forgets: a later preview takes the then current state as the original', () => {
  const node = textNode('Hello');
  const element = fake({ children: [node] });
  const preview = page({ a: [element] });
  preview.apply([text('a', 'one')]);
  preview.clear();
  node.nodeValue = 'Built';
  preview.apply([text('a', 'two')]);
  preview.clear();
  assert.equal(node.nodeValue, 'Built');
  // A second clear changes nothing.
  node.nodeValue = 'Later';
  preview.clear();
  assert.equal(node.nodeValue, 'Later');
});

test('an id with no element on the page is skipped', () => {
  const preview = page({});
  preview.apply([text('gone', 'x'), style('gone', 'gap', '1px'), cls('gone', 'x', true)]);
  preview.clear();
});

test('a change with an item shows on that copy only', () => {
  const copies = [1, 2, 3].map(() => fake({ style: 'gap: 1px' }));
  const preview = page({ a: copies });
  preview.apply([{ ...style('a', 'gap', '9px'), item: 1 }]);
  assert.equal(copies[0]?.painted.get('gap'), '1px');
  assert.equal(copies[1]?.painted.get('gap'), '9px');
  assert.equal(copies[2]?.painted.get('gap'), '1px');
  preview.clear();
  assert.equal(copies[1]?.getAttribute('style'), 'gap: 1px');
});

test('a change with an item the page has no copy for shows nowhere', () => {
  const copies = [fake({ style: 'gap: 1px' }), fake({ style: 'gap: 1px' })];
  const preview = page({ a: copies });
  preview.apply([{ ...cls('a', 'pro', true), item: 5 }]);
  assert.equal(copies[0]?.getAttribute('class'), null);
  assert.equal(copies[1]?.getAttribute('class'), null);
});

test('a change without an item still shows on every copy', () => {
  const copies = [fake(), fake()];
  const preview = page({ a: copies });
  preview.apply([cls('a', 'pro', true)]);
  assert.equal(copies[0]?.getAttribute('class'), 'pro');
  assert.equal(copies[1]?.getAttribute('class'), 'pro');
});
