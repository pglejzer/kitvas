import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOX_START,
  boxProperty,
  linkedSides,
  pickSide,
  sideText,
} from '../../../client/studio/edit/props-box.ts';
import {
  FOLDS_KEY,
  GROUPS,
  groupOf,
  readFolds,
  STYLE_GROUPS,
  type StorageLike,
  toggleFold,
  writeFolds,
} from '../../../client/studio/edit/props-groups.ts';
import { STYLE_PROPERTIES } from '../../../src/edit/index.ts';

/** A storage in memory, or one whose every call throws (blocked site data). */
function memory(start: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(start));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}
const broken: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

test('the groups come in the spec order and hold every style property once', () => {
  assert.deepEqual(
    [...GROUPS],
    ['component', 'text', 'layout', 'spacing', 'size', 'typography', 'background', 'border'],
  );
  const all = Object.values(STYLE_GROUPS).flat();
  assert.deepEqual([...all].sort(), [...STYLE_PROPERTIES].sort());
  assert.equal(new Set(all).size, all.length);
  for (const property of STYLE_PROPERTIES) assert.notEqual(groupOf(property), null, property);
  assert.equal(groupOf('padding-top'), 'spacing');
  assert.equal(groupOf('outline-style'), 'border');
  assert.equal(groupOf('background-image'), 'background');
});

test('the folds are read from the storage, and junk or a blocked storage reads as none', () => {
  const kept = memory({ [FOLDS_KEY]: JSON.stringify(['border', 'nope', 3, 'layout']) });
  assert.deepEqual([...readFolds(kept)].sort(), ['border', 'layout']);
  assert.deepEqual([...readFolds(memory({ [FOLDS_KEY]: '{not json' }))], []);
  assert.deepEqual([...readFolds(memory({ [FOLDS_KEY]: '{"a":1}' }))], []);
  assert.deepEqual([...readFolds(memory())], []);
  assert.deepEqual([...readFolds(broken)], []);
  assert.deepEqual([...readFolds(null)], []);
});

test('the folds are written in the group order, and a refused write is no error', () => {
  const storage = memory();
  writeFolds(storage, new Set(['border', 'spacing']));
  assert.equal(storage.data.get(FOLDS_KEY), '["spacing","border"]');
  assert.doesNotThrow(() => writeFolds(broken, new Set(['layout'])));
  assert.doesNotThrow(() => writeFolds(null, new Set(['layout'])));
});

test('a fold toggles one group and leaves the set it came from as it was', () => {
  const start = new Set(['layout'] as const);
  const folded = toggleFold(start, 'border');
  assert.deepEqual([...folded].sort(), ['border', 'layout']);
  assert.deepEqual([...toggleFold(folded, 'layout')], ['border']);
  assert.deepEqual([...start], ['layout']);
});

test('the box writes one property for the side under its link', () => {
  assert.equal(boxProperty(BOX_START), 'padding-top');
  const left = pickSide(BOX_START, 'margin', 'left');
  assert.deepEqual(left, { layer: 'margin', side: 'left', link: 'one' });
  assert.equal(boxProperty(left), 'margin-left');
  assert.equal(boxProperty({ ...left, link: 'pair' }), 'margin-inline');
  assert.equal(boxProperty({ ...BOX_START, link: 'pair' }), 'padding-block');
  assert.equal(boxProperty({ ...left, link: 'all' }), 'margin');
  // A new side keeps the link the person chose.
  assert.equal(pickSide({ ...BOX_START, link: 'pair' }, 'padding', 'right').link, 'pair');
});

test('the box marks the sides an edit changes', () => {
  assert.deepEqual(linkedSides(BOX_START), ['top']);
  assert.deepEqual(linkedSides({ ...BOX_START, link: 'pair' }), ['top', 'bottom']);
  assert.deepEqual(linkedSides({ ...BOX_START, side: 'right', link: 'pair' }), ['left', 'right']);
  assert.deepEqual(linkedSides({ ...BOX_START, link: 'all' }), ['top', 'right', 'bottom', 'left']);
});

test('a side shows its computed px as a number, another value as it is, nothing as a dash', () => {
  const computed = { 'padding-top': '12px', 'margin-left': '1.5em', 'padding-left': ' ' };
  assert.equal(sideText(computed, 'padding-top'), '12');
  assert.equal(sideText(computed, 'margin-left'), '1.5em');
  assert.equal(sideText(computed, 'padding-left'), '-');
  assert.equal(sideText(null, 'padding-top'), '-');
});
