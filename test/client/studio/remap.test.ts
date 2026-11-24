import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  forgetIds,
  heldIds,
  invertRenames,
  remapCurrent,
  remapIds,
  sameStep,
} from '../../../client/studio/edit/remap.ts';
import {
  type ChangeEntry,
  type EditorState,
  initialState,
} from '../../../client/studio/edit/store.ts';
import type { EditOp } from '../../../src/edit/index.ts';

const P = 'sections/Pricing:section';
const STACK = `${P}/Stack`;
const A = `${P}/Stack/Card`;
const B = `${P}/Stack/Card.2`;
const C = `${P}/Stack/Text`;
const C2 = `${P}/Stack/Text.2`;
const TSX = 'src/tsx/sections/Pricing.tsx';

const line = (id: string | null): ChangeEntry => ({
  by: id === null ? 'claude' : 'person',
  id,
  label: 'Change',
  files: id === null ? [TSX] : [],
  offKit: false,
  at: 1,
});
const prop = (id: string): EditOp => ({
  op: 'setProp',
  id,
  name: 'variant',
  value: { kind: 'string', value: 'outline' },
  before: { kind: 'string', value: 'solid' },
  after: null,
});
const section: EditOp = { op: 'moveSection', section: 'hero', after: null };
const hunk: EditOp = { op: 'patch', file: TSX, hunks: [{ find: 'a', replace: 'b' }] };

function holding(): EditorState {
  return {
    ...initialState('demo'),
    selection: [A, C],
    hovered: B,
    hidden: [C],
    menu: { id: A, x: 1, y: 2 },
    changes: [line(A), line(null)],
    undo: [
      {
        ops: [
          { op: 'moveElement', id: A, anchor: B, place: 'after' },
          { op: 'insertElement', anchor: C, place: 'before', source: '<Badge>New</Badge>' },
        ],
        label: 'Move',
        undoOps: [prop(B)],
      },
      { ops: [prop(STACK)], label: 'Untouched' },
    ],
    redo: [
      {
        ops: [{ op: 'wrapElements', first: A, last: C, open: '<Stack>' }, section, hunk],
        label: 'Wrap',
      },
    ],
    conflict: {
      gesture: { ops: [{ op: 'removeElement', id: A }], label: 'Delete' },
      outcome: {
        outcome: 'conflict',
        version: 2,
        index: 0,
        reason: 'changed',
        file: TSX,
        text: '',
        etag: `"${'e'.repeat(27)}"`,
      },
    },
    refused: {
      gesture: { ops: [{ op: 'unwrapElement', id: C }], label: 'Unwrap' },
      index: 0,
      reason: 'in-expression',
    },
  };
}

const renames = { [A]: B, [B]: A, [C]: C2 };

test('renames remap every part that holds an id', () => {
  const state = holding();
  const patch = remapIds(state, renames);
  assert.deepEqual(patch.selection, [B, C2]);
  assert.equal(patch.hovered, A);
  assert.deepEqual(patch.hidden, [C2]);
  assert.deepEqual(patch.menu, { id: B, x: 1, y: 2 });
  assert.deepEqual(
    patch.changes?.map((entry) => entry.id),
    [B, null],
  );
  assert.deepEqual(patch.undo?.[0]?.ops, [
    { op: 'moveElement', id: B, anchor: A, place: 'after' },
    { op: 'insertElement', anchor: C2, place: 'before', source: '<Badge>New</Badge>' },
  ]);
  assert.deepEqual(patch.undo?.[0]?.undoOps, [prop(A)]);
  assert.deepEqual(patch.redo?.[0]?.ops, [
    { op: 'wrapElements', first: B, last: C2, open: '<Stack>' },
    section,
    hunk,
  ]);
  assert.deepEqual(patch.conflict?.gesture.ops, [{ op: 'removeElement', id: B }]);
  assert.deepEqual(patch.refused?.gesture.ops, [{ op: 'unwrapElement', id: C2 }]);
});

test('a swap is applied at once, never one rename after another', () => {
  const state = { ...initialState('demo'), selection: [A, B] };
  assert.deepEqual(remapIds(state, { [A]: B, [B]: A }).selection, [B, A]);
});

test('renames that touch nothing held leave every part out', () => {
  const state = holding();
  assert.deepEqual(remapIds(state, {}), {});
  assert.deepEqual(remapIds(state, { [`${P}/Grid`]: `${P}/Grid.2` }), {});
});

test('a step without a renamed id keeps its object, a renamed one is still the same step', () => {
  const state = holding();
  const patch = remapIds(state, renames);
  const [moved, untouched] = patch.undo ?? [];
  const [first, second] = state.undo;
  assert.ok(moved && untouched && first && second);
  assert.notEqual(moved, first);
  assert.equal(sameStep(moved, first), true);
  assert.equal(untouched, second);
  const again = remapIds({ ...state, undo: [moved] }, { [B]: C }).undo?.[0];
  assert.ok(again);
  assert.equal(sameStep(again, first), true);
  assert.equal(sameStep(again, second), false);
});

test('after the person own edit the stacks stay as they are', () => {
  const state = holding();
  const patch = remapCurrent(state, renames);
  assert.deepEqual(patch.selection, [B, C2]);
  assert.equal(patch.undo, undefined);
  assert.equal(patch.redo, undefined);
  assert.equal(patch.conflict, undefined);
});

test('an id another element took leaves the selection, the hover and the menu', () => {
  const state = holding();
  // `Card` was removed and `Card.2` took its id: `Card` names the other card now.
  const patch = remapCurrent(state, { [B]: A });
  assert.deepEqual(patch.selection, [C]);
  assert.equal(patch.hovered, A);
  assert.equal(patch.menu, null);
  // The change list keeps its lines.
  assert.equal(patch.changes, undefined);
});

test('an id a created element took leaves the selection', () => {
  const state = { ...initialState('demo'), selection: [A, C], hidden: [C] };
  const patch = remapCurrent(state, {}, [C]);
  assert.deepEqual(patch.selection, [A]);
  assert.deepEqual(patch.hidden, []);
});

test('an id renamed and taken by another element at once stays held', () => {
  const state = { ...initialState('demo'), selection: [A] };
  assert.deepEqual(remapCurrent(state, { [A]: B, [B]: A }).selection, [B]);
});

test('elements Claude removed are forgotten, with every step that names one', () => {
  const state = holding();
  const patch = forgetIds(state, new Set([A]));
  assert.deepEqual(patch.selection, [C]);
  assert.equal(patch.menu, null);
  assert.deepEqual(
    patch.undo?.map((step) => step.label),
    ['Untouched'],
  );
  assert.deepEqual(patch.redo, []);
  assert.equal(patch.hovered, undefined);
  assert.deepEqual(forgetIds(state, new Set()), {});
});

test('the held ids are every id of every part, once each', () => {
  const held = heldIds(holding());
  assert.deepEqual([...held].sort(), [A, B, C, STACK].sort());
  assert.equal(new Set(held).size, held.length);
});

test('turned round, renames undo themselves', () => {
  const there = { [A]: B, [B]: A, [C]: C2 };
  const state = holding();
  const moved = { ...state, ...remapIds(state, there) };
  const back = { ...moved, ...remapIds(moved, invertRenames(there)) };
  assert.deepEqual(back.selection, state.selection);
  assert.deepEqual(back.undo, state.undo);
});
