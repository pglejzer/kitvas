import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterItems,
  groupItems,
  moveActive,
  type SelectItem,
} from '../../../../../client/studio/ui/select/model.ts';

function item(value: string, name: string, group: string | null): SelectItem {
  return { value, name, group, detail: null, swatch: null, warn: null };
}

test('the filter matches name, value and group, ignoring case', () => {
  const inkSoft = item('#a4a9b2', 'inkSoft', 'color');
  const surface = item('#ffffff', 'surface', 'color');
  const items = [inkSoft, surface];
  assert.deepEqual(filterItems(items, 'INK'), [inkSoft]);
  assert.deepEqual(filterItems(items, '#fff'), [surface]);
  assert.deepEqual(filterItems(items, 'color.surf'), [surface]);
  assert.deepEqual(filterItems(items, ''), items);
});

test('the filter matches a group and a name written together', () => {
  const surface = item('#ffffff', 'surface', 'color');
  assert.deepEqual(filterItems([surface], 'color'), [surface]);
});

test('groups keep the order they first appear in', () => {
  const groups = groupItems([
    item('a', 'a', 'color'),
    item('b', 'b', 'color.brand'),
    item('c', 'c', 'color'),
  ]);
  assert.deepEqual(
    groups.map((entry) => entry.group),
    ['color', 'color.brand'],
  );
  assert.equal(groups[0]?.items.length, 2);
});

test('moving down from nothing takes the first, up from nothing the last', () => {
  assert.equal(moveActive(null, 'ArrowDown', 5), 0);
  assert.equal(moveActive(null, 'ArrowUp', 5), 4);
});

test('moving stops at the ends', () => {
  assert.equal(moveActive(4, 'ArrowDown', 5), 4);
  assert.equal(moveActive(0, 'ArrowUp', 5), 0);
});

test('Page keys move by eight, Home and End to the ends', () => {
  assert.equal(moveActive(1, 'PageDown', 20), 9);
  assert.equal(moveActive(3, 'PageUp', 20), 0);
  assert.equal(moveActive(7, 'Home', 20), 0);
  assert.equal(moveActive(7, 'End', 20), 19);
});

test('an empty list has no active option', () => {
  assert.equal(moveActive(2, 'ArrowDown', 0), null);
});
