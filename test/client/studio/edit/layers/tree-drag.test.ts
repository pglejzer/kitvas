import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isNoop,
  isWithin,
  type Row,
  sectionDrop,
  treeDrop,
  zoneOf,
} from '../../../../../client/studio/edit/layers/tree-drag.ts';

const row = (id: string, parent: string | null, over: Partial<Row> = {}): Row => ({
  id,
  parent,
  movable: null,
  accepts: true,
  mixed: false,
  interactive: false,
  root: null,
  ...over,
});

const rows = new Map<string, Row>(
  [
    row('root', null, { root: 'section' }),
    row('card', 'root'),
    row('title', 'card'),
    row('btn', 'root', { interactive: true }),
    row('input', 'root', { accepts: false }),
    row('mixed', 'root', { mixed: true }),
    row('inside-mixed', 'mixed'),
    row('item', 'root', { movable: 'in-expression' }),
    row('link', 'btn', { interactive: true }),
  ].map((entry) => [entry.id, entry]),
);

test('a row that takes children is cut in thirds', () => {
  assert.equal(zoneOf(0.1, true), 'before');
  assert.equal(zoneOf(0.5, true), 'inside');
  assert.equal(zoneOf(0.9, true), 'after');
});

test('a row that takes no children has halves and never inside', () => {
  assert.equal(zoneOf(0.2, false), 'before');
  assert.equal(zoneOf(0.5, false), 'after');
  assert.equal(zoneOf(0.45, false), 'before');
});

test('inside a row drops last into it', () => {
  assert.deepEqual(treeDrop(rows, ['btn'], 'card', 'inside'), { anchor: 'card', place: 'last' });
});

test('before and after a row drop beside it', () => {
  assert.deepEqual(treeDrop(rows, ['title'], 'input', 'before'), {
    anchor: 'input',
    place: 'before',
  });
});

test('no inside for a row that takes no children', () => {
  assert.equal(treeDrop(rows, ['title'], 'input', 'inside'), null);
});

test('no drop into itself or its own descendants', () => {
  assert.equal(treeDrop(rows, ['card'], 'card', 'inside'), null);
  assert.equal(treeDrop(rows, ['card'], 'title', 'before'), null);
  assert.equal(isWithin(rows, 'title', 'card'), true);
  assert.equal(isWithin(rows, 'card', 'title'), false);
});

test('a root has no sibling places and cannot be dragged', () => {
  assert.equal(treeDrop(rows, ['card'], 'root', 'before'), null);
  assert.equal(treeDrop(rows, ['root'], 'card', 'inside'), null);
});

test('no place between the children of a mixed parent, none inside a mixed row', () => {
  assert.equal(treeDrop(rows, ['card'], 'inside-mixed', 'after'), null);
  assert.equal(treeDrop(rows, ['card'], 'mixed', 'inside'), null);
});

test('no place beside an element inside an expression', () => {
  assert.equal(treeDrop(rows, ['card'], 'item', 'after'), null);
});

test('an interactive element never goes inside another interactive one', () => {
  assert.equal(treeDrop(rows, ['btn'], 'link', 'before'), null);
  assert.equal(treeDrop(rows, ['link'], 'btn', 'inside'), null);
});

test('a source that cannot move gives no drop', () => {
  const stuck = new Map(rows).set('card', row('card', 'root', { movable: 'slot-root' }));
  assert.equal(treeDrop(stuck, ['card'], 'btn', 'after'), null);
});

test('a drop right where the element already is is a no-op', () => {
  const order = ['a', 'b', 'c'];
  assert.equal(isNoop(order, ['b'], { anchor: 'c', place: 'before' }), true);
  assert.equal(isNoop(order, ['b'], { anchor: 'a', place: 'after' }), true);
  assert.equal(isNoop(order, ['a'], { anchor: 'c', place: 'before' }), false);
  assert.equal(isNoop(order, ['b'], { anchor: 'c', place: 'last' }), false);
});

test('section rows reorder only among sections', () => {
  const order = ['hero', 'plans', 'faq'];
  assert.deepEqual(sectionDrop(order, 'faq', 'hero', 'before', 0.1), {
    section: 'faq',
    after: null,
  });
  assert.deepEqual(sectionDrop(order, 'hero', 'plans', 'after', 0.9), {
    section: 'hero',
    after: 'plans',
  });
  assert.deepEqual(sectionDrop(order, 'hero', 'faq', 'before', 0.1), {
    section: 'hero',
    after: 'plans',
  });
});

test('a section dropped where it is, or on itself, does nothing', () => {
  const order = ['hero', 'plans', 'faq'];
  assert.equal(sectionDrop(order, 'plans', 'plans', 'before', 0.1), null);
  assert.equal(sectionDrop(order, 'plans', 'hero', 'after', 0.9), null);
  assert.equal(sectionDrop(order, 'plans', 'faq', 'before', 0.1), null);
});

test('inside on a section row reads as the nearer half', () => {
  const order = ['hero', 'plans', 'faq'];
  assert.deepEqual(sectionDrop(order, 'faq', 'plans', 'inside', 0.2), {
    section: 'faq',
    after: 'hero',
  });
  assert.deepEqual(sectionDrop(order, 'hero', 'plans', 'inside', 0.8), {
    section: 'hero',
    after: 'plans',
  });
});
