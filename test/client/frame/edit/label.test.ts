import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelled, labelName, labelPlace, labelText } from '../../../../client/frame/edit/label.ts';

test('the name is the JSX tag of the id', () => {
  assert.equal(labelName('sections/Hero:section/Stack/Button.2'), 'Button');
  assert.equal(labelName('sections/Hero:section'), 'section');
  assert.equal(labelName('sections/Hero:section/Card.Header'), 'Card.Header');
  assert.equal(labelName('sections/Hero:section/Card.Header.3'), 'Card.Header');
  assert.equal(labelName('index:Page'), 'Page');
});

test('hover says the name and select adds the rounded size', () => {
  const box = { width: 320.4, height: 47.6 };
  assert.equal(labelText('a:section/Stack', 'hover', box), 'Stack');
  assert.equal(labelText('a:section/Stack', 'select', box), 'Stack · 320 × 48');
});

test('a label sits above the box, flush left', () => {
  const box = { left: 40, top: 100, width: 200, height: 50 };
  assert.deepEqual(labelPlace(box, 1000, 60, 16), { left: 40, top: 84 });
});

test('a label goes inside the top edge when there is no room above', () => {
  const box = { left: 40, top: 10, width: 200, height: 50 };
  assert.deepEqual(labelPlace(box, 1000, 60, 16), { left: 40, top: 10 });
  assert.deepEqual(labelPlace({ ...box, top: 16 }, 1000, 60, 16), { left: 40, top: 0 });
});

test('a label goes under a box it would cover when there is no room above', () => {
  // Zoomed out, a label keeps its size on screen, so in page pixels it is larger than a button.
  const button = { left: 1400, top: 20, width: 93, height: 37 };
  assert.deepEqual(labelPlace(button, 1885, 320, 45), { left: 1400, top: 57 });
  // A box under twice the label's height would lose most of itself to a label inside it.
  assert.deepEqual(labelPlace({ left: 40, top: 10, width: 200, height: 31 }, 1000, 60, 16), {
    left: 40,
    top: 41,
  });
});

test('a label stays inside the page and never goes below zero on the left', () => {
  const box = { left: 950, top: 100, width: 100, height: 50 };
  assert.deepEqual(labelPlace(box, 1000, 80, 16), { left: 920, top: 84 });
  assert.equal(labelPlace(box, 50, 80, 16).left, 0);
});

test('an element both hovered and selected gets the select label only', () => {
  const box = { left: 0, top: 0, width: 10, height: 10 };
  const a = {};
  const b = {};
  const shown = labelled([
    { element: a, id: 'x:A', kind: 'hover', box },
    { element: b, id: 'x:B', kind: 'hover', box },
    { element: a, id: 'x:A', kind: 'select', box },
    { element: {}, id: null, kind: 'hover', box },
    { element: {}, id: 'x:C', kind: 'hover', box: undefined },
  ]);
  assert.deepEqual(
    shown.map((item) => `${item.id}:${item.kind}`),
    ['x:B:hover', 'x:A:select'],
  );
});

test('a selection of several elements gets no label; a hovered one outside it keeps its own', () => {
  const box = { left: 0, top: 0, width: 10, height: 10 };
  const a = {};
  const b = {};
  const shown = labelled([
    { element: {}, id: 'x:C', kind: 'hover', box },
    { element: a, id: 'x:A', kind: 'hover', box },
    { element: a, id: 'x:A', kind: 'select', box },
    { element: b, id: 'x:B', kind: 'select', box },
  ]);
  assert.deepEqual(
    shown.map((item) => `${item.id}:${item.kind}`),
    ['x:C:hover'],
  );
  // Copies of one id are several elements too.
  const rows = labelled([
    { element: {}, id: 'x:Row', kind: 'select', box },
    { element: {}, id: 'x:Row', kind: 'select', box },
    { element: {}, id: 'x:Row', kind: 'select', box },
  ]);
  assert.deepEqual(rows, []);
});
