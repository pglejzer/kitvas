import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LayerNode, LayerText } from '../../../src/checks/index.ts';
import { componentOf, layerName } from '../../../src/handoff/domain/figma/names.ts';

function node(over: Partial<LayerNode> = {}): LayerNode {
  return {
    parent: -1,
    ks: null,
    ownKs: false,
    tag: 'div',
    box: [0, 0, 100, 50],
    kind: 'frame',
    placed: 'flow',
    fill: [false, false],
    flow: null,
    paints: [],
    border: null,
    radius: [0, 0, 0, 0],
    shadows: [],
    opacity: 1,
    clips: false,
    text: null,
    svg: null,
    ...over,
  };
}

function text(characters: string): LayerText {
  return {
    characters,
    truncated: false,
    family: 'Inter',
    weight: 400,
    italic: false,
    size: 16,
    lineHeight: 24,
    letterSpacing: 0,
    align: 'left',
    transform: 'none',
    colour: '#000000ff',
    runs: [],
  };
}

test('an element with its own id and a capitalised tag is that kit component', () => {
  const root = node({ ks: 'sections/Hero:section/Button', ownKs: true, tag: 'button' });
  assert.equal(layerName(root, 'Button'), 'Button');
  assert.equal(componentOf(root, 'Button'), 'Button');
  assert.equal(layerName(node({ ownKs: true, ks: 'a:b' }), 'Card.Header'), 'Card.Header');
});

test('what a component draws inside itself is named by its tag, not by the component', () => {
  const inside = node({ ks: 'sections/Hero:section/Button', ownKs: false, tag: 'span' });
  assert.equal(layerName(inside, 'Button'), 'span');
  assert.equal(componentOf(inside, 'Button'), null);
});

test('an element with an id and a lower-case tag is named by its HTML tag', () => {
  const section = node({ ks: 'sections/Hero:section', ownKs: true, tag: 'section' });
  assert.equal(layerName(section, 'section'), 'section');
  assert.equal(componentOf(section, 'section'), null);
});

test('a text layer is named by its first 30 characters, white space collapsed', () => {
  const heading = node({
    kind: 'text',
    tag: 'h1',
    text: text('  Pricing   that grows with\n your team, however large it gets '),
  });
  assert.equal(layerName(heading, null), 'Pricing that grows with your t');
  assert.equal(Array.from(layerName(heading, null)).length, 30);
  assert.equal(layerName(node({ kind: 'text', tag: 'p', text: text('Hi') }), null), 'Hi');
});

test('a text of white space only is named by its tag', () => {
  assert.equal(layerName(node({ kind: 'text', tag: 'p', text: text(' \n ') }), null), 'p');
});

test('a layer with no name of its own is named by its tag', () => {
  assert.equal(layerName(node({ tag: 'div' }), null), 'div');
  assert.equal(layerName(node({ tag: 'IMG', kind: 'image' }), null), 'img');
  assert.equal(layerName(node({ tag: '' }), null), 'layer');
});

test('no name holds a path or an element id', () => {
  const id = 'sections/Hero:section/Button.2';
  const found = [
    layerName(node({ ks: id, ownKs: true, tag: 'button' }), 'Button'),
    layerName(node({ ks: id, ownKs: true, tag: 'div' }), 'sections/Hero'),
    layerName(node({ ks: id, ownKs: true, tag: 'div' }), id),
    layerName(node({ ks: id, tag: 'a' }), null),
    layerName(node({ tag: 'src/tsx/sections/Hero.tsx' }), null),
  ];
  for (const name of found) {
    assert.doesNotMatch(name, /[/\\:]|\.tsx/, name);
  }
  assert.equal(found[1], 'div');
  assert.equal(found[2], 'div');
  assert.equal(found[4], 'layer');
});
