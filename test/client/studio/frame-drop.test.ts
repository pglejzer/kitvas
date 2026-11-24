import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameMoveOps } from '../../../client/studio/edit/frame-drop.ts';
import type { Structure, StructureEntry } from '../../../src/studio/api/structure-schemas.ts';

const S = 'sections/Hero:Stack';
const entry = (id: string, hash: string): StructureEntry => ({
  id,
  file: 'src/tsx/sections/Hero.tsx',
  line: 4,
  column: 7,
  tag: 'Text',
  parent: S,
  hash,
  text: null,
  props: [],
  component: 'Text',
  movable: null,
  accepts: true,
  mixed: false,
  interactive: false,
  root: null,
});
const structure: Structure = {
  version: 2,
  folder: '/d/hero/v2',
  etags: {},
  elements: [entry(`${S}/Text`, 'a'.repeat(16)), entry(`${S}/Text.2`, 'b'.repeat(16))],
  sections: [],
};

test('a dropped element moves to the slot with the hash the structure read', () => {
  assert.deepEqual(
    frameMoveOps([`${S}/Text.2`], { anchor: `${S}/Text`, place: 'before' }, structure),
    [
      {
        op: 'moveElement',
        id: `${S}/Text.2`,
        anchor: `${S}/Text`,
        place: 'before',
        hash: 'b'.repeat(16),
      },
    ],
  );
});

test('a dropped group keeps its document order: the first to the slot, each next after it', () => {
  const ops = frameMoveOps(
    [`${S}/Text.2`, `${S}/Text`],
    { anchor: 'sections/Plans:Stack', place: 'first' },
    structure,
  );
  assert.deepEqual(
    ops.map((op) => (op.op === 'moveElement' ? [op.id, op.anchor, op.place] : [])),
    [
      [`${S}/Text`, 'sections/Plans:Stack', 'first'],
      [`${S}/Text.2`, `${S}/Text`, 'after'],
    ],
  );
});

test('an id the structure does not know moves without a hash', () => {
  const [op] = frameMoveOps(
    ['sections/Hero:Stack/Badge'],
    { anchor: `${S}/Text`, place: 'after' },
    structure,
  );
  assert.ok(op?.op === 'moveElement');
  assert.equal('hash' in op, false);
});
