import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ElementSnapshot } from '../../../../client/channel/protocol.ts';
import {
  compareSummary,
  diffElements,
  type ElementDiff,
} from '../../../../client/studio/draft/diff.ts';

const el = (id: string, change: Partial<ElementSnapshot> = {}): ElementSnapshot => ({
  id,
  width: 100,
  height: 40,
  text: 'Buy',
  style: 'color:rgb(29, 32, 37);',
  ...change,
});

const NONE: ElementDiff = { changed: [], added: [], removed: [] };

const TEXTS = {
  changed: '{count} changed',
  added: '{count} added',
  removed: '{count} removed',
  same: 'Nothing changed',
};

test('the same elements give an empty diff', () => {
  const items = [el('a:main'), el('a:main/h1', { text: 'Shop' })];
  const copy = items.map((item) => ({ ...item }));
  assert.deepEqual(diffElements(items, copy), NONE);
  assert.deepEqual(diffElements([], []), NONE);
});

test('text, style or a size more than 1 px apart is a change', () => {
  const before = [el('t'), el('s'), el('w'), el('h'), el('n1'), el('n2')];
  const after = [
    el('t', { text: 'Buy now' }),
    el('s', { style: 'color:rgb(0, 0, 0);' }),
    el('w', { width: 101.5 }),
    el('h', { height: 38 }),
    el('n1', { width: 101 }),
    el('n2', { height: 39.5 }),
  ];
  assert.deepEqual(diffElements(before, after), { ...NONE, changed: ['t', 's', 'w', 'h'] });
});

test('ids only in the newer version are added, only in the older removed', () => {
  const before = [el('a'), el('gone-1'), el('b'), el('gone-2')];
  const after = [el('new-1'), el('a'), el('b'), el('new-2')];
  const expected = { changed: [], added: ['new-1', 'new-2'], removed: ['gone-1', 'gone-2'] };
  assert.deepEqual(diffElements(before, after), expected);
});

test('an id drawn many times changes when the count or any one of them does', () => {
  const rows = [el('row', { text: 'One' }), el('row', { text: 'Two' })];
  const longer = [...rows, el('row', { text: 'Three' })];
  const edited = [rows[0] ?? el('x'), el('row', { text: 'Too' })];
  const turned = [...rows].reverse();
  assert.deepEqual(diffElements(rows, [...rows]).changed, []);
  assert.deepEqual(diffElements(rows, longer).changed, ['row']);
  assert.deepEqual(diffElements(rows, edited).changed, ['row']);
  assert.deepEqual(diffElements(rows, turned).changed, ['row']);
});

test('each id is listed once, in the order of its version', () => {
  const before = [el('x'), el('x'), el('y'), el('old'), el('old')];
  const after = [el('y', { text: 'Y' }), el('x', { text: 'X' }), el('x'), el('new'), el('new')];
  const expected = { changed: ['y', 'x'], added: ['new'], removed: ['old'] };
  assert.deepEqual(diffElements(before, after), expected);
});

test('the summary names the counts that are not zero, or says nothing changed', () => {
  const all = { changed: ['a', 'b', 'c'], added: ['d'], removed: ['e', 'f'] };
  const some = { ...all, changed: [] };
  assert.equal(compareSummary(all, TEXTS), '3 changed, 1 added, 2 removed');
  assert.equal(compareSummary(some, TEXTS), '1 added, 2 removed');
  assert.equal(compareSummary(NONE, TEXTS), 'Nothing changed');
});

test('every {count} in a template is filled; an empty template is left out', () => {
  const texts = { ...TEXTS, changed: '{count} of {count}', added: '' };
  const diff = { changed: ['a', 'b'], added: ['c'], removed: [] };
  assert.equal(compareSummary(diff, texts), '2 of 2');
});
