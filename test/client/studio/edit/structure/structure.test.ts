import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ENTRIES } from '../../../../../client/channel/structure-protocol.ts';
import { frameEntries } from '../../../../../client/studio/edit/structure/structure.ts';
import type {
  Structure,
  StructureEntry,
} from '../../../../../src/studio/api/edit/structure-schemas.ts';

const S = 'sections/Pricing:section/Stack';

const entry = (id: string, over: Partial<StructureEntry> = {}): StructureEntry => ({
  id,
  file: 'src/tsx/sections/Pricing.tsx',
  line: 4,
  column: 7,
  tag: 'Card',
  parent: S,
  hash: 'a'.repeat(16),
  text: null,
  props: [],
  component: 'Card',
  movable: null,
  accepts: true,
  mixed: false,
  interactive: false,
  root: null,
  ...over,
});

const structureOf = (elements: StructureEntry[]): Structure => ({
  version: 2,
  folder: '/d/shop/v2',
  etags: {},
  elements,
  sections: [],
});

test('the frame hears of each element what a drag needs, and nothing of its source', () => {
  const structure = structureOf([entry(`${S}/Text`), entry(S, { root: 'section', mixed: true })]);
  assert.deepEqual(frameEntries(structure), [
    {
      id: `${S}/Text`,
      movable: true,
      lists: [],
      item: false,
      accepts: true,
      mixed: false,
      interactive: false,
      root: null,
    },
    {
      id: S,
      movable: true,
      lists: [],
      item: false,
      accepts: true,
      mixed: true,
      interactive: false,
      root: 'section',
    },
  ]);
});

test('an element with a refusal is not movable; a list item says so, movable or not', () => {
  const structure = structureOf([
    entry(`${S}/Card`, { movable: 'in-expression', item: true }),
    // A plain child of the item's template moves as an element (ADR 0065).
    entry(`${S}/Card/Text`, { movable: null, item: false }),
    // An entry that leaves `item` out is no list item.
    entry(`${S}/Button`),
  ]);
  const [item, inner, silent] = frameEntries(structure);
  assert.deepEqual([item?.movable, item?.item], [false, true]);
  assert.deepEqual([inner?.movable, inner?.item], [true, false]);
  assert.deepEqual([silent?.movable, silent?.item], [true, false]);
});

test('the frame hears the lists around each element: their roots, none, or not countable', () => {
  const card = `${S}/Card`;
  const row = `${card}/ul/li`;
  const structure = structureOf([
    entry(card, { lists: [card], item: true }),
    entry(`${card}/Heading`, { lists: [card] }),
    entry(row, { lists: [card, row], item: true }),
    entry(`${S}/aside`, { lists: null }),
    // A structure read by an older server names no lists.
    entry(`${S}/Button`),
  ]);
  assert.deepEqual(
    frameEntries(structure).map((each) => each.lists),
    [[card], [card], [card, row], null, []],
  );
});

test('the frame gets no more entries than the channel takes', () => {
  const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, index) => entry(`${S}/Text.${index}`));
  assert.equal(frameEntries(structureOf(many)).length, MAX_ENTRIES);
});
