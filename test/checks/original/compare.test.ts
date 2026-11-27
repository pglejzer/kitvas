import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareLayers,
  compareOutlines,
  DIFFS_MAX,
} from '../../../src/checks/domain/kit/original-compare.ts';
import type { LayerNode } from '../../../src/checks/index.ts';
import { buttonNodes, layerFacts, layerNode, layerText } from '../verify/support.ts';

/** The walk of the button with `change` applied to the node at `at`. */
function changed(at: number, change: Partial<LayerNode>) {
  const nodes = buttonNodes();
  const node = nodes[at];
  if (!node) throw new Error('no such node');
  nodes[at] = { ...node, ...change };
  return layerFacts(nodes);
}

const original = layerFacts(buttonNodes());

test('equal walks have no difference', () => {
  assert.deepEqual(compareLayers(layerFacts(buttonNodes()), original), { diffs: [], more: 0 });
});

test('boxes are read inside the root, not on the page', () => {
  const moved = buttonNodes().map((node) => ({
    ...node,
    box: [node.box[0] + 40, node.box[1] + 90, node.box[2], node.box[3]] as LayerNode['box'],
  }));
  assert.deepEqual(compareLayers(layerFacts(moved), original).diffs, []);
});

test('a box within half a pixel is equal', () => {
  assert.deepEqual(compareLayers(changed(0, { box: [16, 16, 120.4, 40] }), original).diffs, []);
  assert.deepEqual(compareLayers(changed(0, { box: [16, 16, 120.6, 40] }), original).diffs, [
    { element: 'button', property: 'width', copy: '120.6px', original: '120px' },
  ]);
});

test('one wrong value is one finding that names it', () => {
  const [first] = buttonNodes();
  const flow = first?.flow;
  assert.ok(flow);
  const copy = changed(0, { flow: { ...flow, padding: [8, 16, 8, 16] } });
  assert.deepEqual(
    compareLayers(copy, changed(0, { flow: { ...flow, padding: [8, 14, 8, 16] } })),
    {
      diffs: [
        {
          element: 'button',
          property: 'padding',
          copy: '8px 16px 8px 16px',
          original: '8px 14px 8px 16px',
        },
      ],
      more: 0,
    },
  );
});

test('a different structure stops the pairing there', () => {
  const [first, second] = buttonNodes();
  assert.ok(first && second);
  const extra = layerNode({ tag: 'i', parent: 0, kind: 'frame', box: [100, 24, 8, 8] });
  // The copy has one node more at place 3; pairs 1 and 2 differ in a value, place 3 in structure.
  const copy = layerFacts([
    { ...first, opacity: 0.5 },
    { ...second, text: layerText({ characters: 'Save!' }) },
    extra,
  ]);
  const result = compareLayers(copy, original);
  assert.deepEqual(
    result.diffs.map((diff) => [diff.element, diff.property]),
    [
      ['button', 'opacity'],
      ['button > span', 'text'],
      ['button > i[2]', 'structure'],
    ],
  );
  assert.equal(result.more, 0);
  // A kind that differs in the middle stops the pairing: nothing after it is compared.
  const wrongKind = layerFacts([
    first,
    { ...second, kind: 'frame', text: null },
    { ...extra, opacity: 0.1 },
  ]);
  const stopped = compareLayers(wrongKind, layerFacts([first, second, { ...extra, opacity: 0.9 }]));
  assert.deepEqual(
    stopped.diffs.map((diff) => diff.property),
    ['structure'],
  );
});

test('more than twenty differences', () => {
  const many = Array.from({ length: 25 }, (_, at) =>
    layerNode({ tag: 'p', parent: 0, box: [16, 16 + at, 10, 10] }),
  );
  const root = layerNode({ tag: 'div', box: [16, 16, 100, 400] });
  const copy = layerFacts([root, ...many]);
  const first = layerFacts([root, ...many.map((node) => ({ ...node, opacity: 0.5 }))]);
  const result = compareLayers(copy, first);
  assert.equal(result.diffs.length, DIFFS_MAX);
  assert.equal(result.more, 5);
});

test('text, font and colour are compared', () => {
  const text = (over: Parameters<typeof layerText>[0]) => changed(1, { text: layerText(over) });
  const cases: [string, ReturnType<typeof changed>, string, string][] = [
    ['text', text({ characters: 'Send' }), 'Send', 'Save'],
    ['font-family', text({ family: 'georgia' }), 'georgia', 'inter'],
    ['font-weight', text({ weight: 700 }), '700', '500'],
    ['line-height', text({ lineHeight: 24 }), '24px', '20px'],
    ['letter-spacing', text({ letterSpacing: 1 }), '1px', '0px'],
    ['color', text({ colour: '#000000ff' }), '#000000ff', '#ffffffff'],
  ];
  for (const [property, copy, got, want] of cases) {
    assert.deepEqual(
      compareLayers(copy, original).diffs,
      [{ element: 'button > span', property, copy: got, original: want }],
      property,
    );
  }
  const box: [string, ReturnType<typeof changed>, string, string][] = [
    [
      'background',
      changed(0, { paints: [{ kind: 'solid', colour: '#ff0000ff' }] }),
      '#ff0000ff',
      '#1f5fd0ff',
    ],
    ['border-radius', changed(0, { radius: [8, 8, 8, 8] }), '8px 8px 8px 8px', '6px 6px 6px 6px'],
    ['opacity', changed(0, { opacity: 0.5 }), '0.5', '1'],
    [
      'box-shadow',
      changed(0, {
        shadows: [{ x: 0, y: 1, blur: 2, spread: 0, colour: '#00000033', inset: false }],
      }),
      '0px 1px 2px 0px #00000033',
      'none',
    ],
  ];
  for (const [property, copy, got, want] of box) {
    assert.deepEqual(
      compareLayers(copy, original).diffs,
      [{ element: 'button', property, copy: got, original: want }],
      property,
    );
  }
});

test('outlines are compared by place', () => {
  const ring = { place: '/0', element: 'button', value: '2px solid rgb(31, 95, 208), offset 2px' };
  assert.deepEqual(compareOutlines([], [ring]), [
    { element: 'button', property: 'outline', copy: 'none', original: ring.value },
  ]);
  assert.deepEqual(compareOutlines([ring], []), [
    { element: 'button', property: 'outline', copy: ring.value, original: 'none' },
  ]);
  assert.deepEqual(compareOutlines([ring], [{ ...ring, value: '1px solid red, offset 0px' }]), [
    {
      element: 'button',
      property: 'outline',
      copy: ring.value,
      original: '1px solid red, offset 0px',
    },
  ]);
  assert.deepEqual(compareOutlines([ring], [ring]), []);
});
