import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelled, labelName, labelPlace, labelText } from '../../../client/frame/label.ts';

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
