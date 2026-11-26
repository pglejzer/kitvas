import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EditOpSchema,
  fileOfId,
  inverse,
  inverseAll,
  type SimpleOp,
  styleText,
  targetOf,
} from '../../../src/edit/index.ts';

const id = 'sections/Pricing:section/Stack/Card.2';

const ops: SimpleOp[] = [
  {
    op: 'setProp',
    id,
    name: 'variant',
    value: { kind: 'string', value: 'outline' },
    before: { kind: 'string', value: 'solid' },
    after: null,
  },
  {
    op: 'setProp',
    id,
    name: 'size',
    value: { kind: 'string', value: 'sm' },
    before: null,
    after: 'variant',
  },
  {
    op: 'removeProp',
    id,
    name: 'disabled',
    before: { kind: 'boolean', value: true },
    after: 'size',
  },
  { op: 'setText', id, value: 'Start free', before: "Don't wait" },
  {
    op: 'setStyle',
    id,
    className: 'card',
    property: 'gap',
    value: { token: '--kit-space-md' },
    before: { raw: '13px' },
    newRule: false,
  },
  {
    op: 'setStyle',
    id,
    className: 'card',
    property: 'padding',
    value: { raw: '13px' },
    before: null,
    newRule: true,
  },
  {
    op: 'removeStyle',
    id,
    className: 'card',
    property: 'color',
    before: { token: '--kit-color-ink' },
    dropRule: false,
  },
  { op: 'addClass', id, className: 'pricing-card' },
  { op: 'removeClass', id, className: 'pricing-card' },
];

const at = (index: number): SimpleOp => {
  const op = ops[index];
  if (!op) throw new Error(`no op ${index}`);
  return op;
};

test('every op passes its schema, and so does its inverse', () => {
  for (const op of ops) {
    assert.deepEqual(EditOpSchema.parse(op), op);
    EditOpSchema.parse(inverse(op));
  }
});

test('the inverse of the inverse is the op itself', () => {
  for (const op of ops) assert.deepEqual(inverse(inverse(op)), op);
});

test('adding is undone by removing, with the place kept for the redo', () => {
  assert.deepEqual(inverse(at(1)), {
    op: 'removeProp',
    id,
    name: 'size',
    before: { kind: 'string', value: 'sm' },
    after: 'variant',
  });
  const created = inverse(at(5));
  assert.equal(created.op === 'removeStyle' && created.dropRule, true);
});

test('a gesture is undone in reverse order', () => {
  const undone = inverseAll([at(7), at(5)]);
  assert.deepEqual(
    undone.map((op) => op.op),
    ['removeStyle', 'removeClass'],
  );
});

test('the schema refuses what kitvas never writes', () => {
  for (const name of ['className', 'key', 'ref', 'style', '1x']) {
    assert.equal(EditOpSchema.safeParse({ ...at(0), name }).success, false, name);
  }
  for (const raw of ['red; color: blue', '1px }', 'a /* b', '']) {
    assert.equal(EditOpSchema.safeParse({ ...at(4), value: { raw } }).success, false, raw);
  }
  assert.equal(
    EditOpSchema.safeParse({ ...at(4), value: { token: '--brand-ink' } }).success,
    false,
  );
  assert.equal(EditOpSchema.safeParse({ ...at(0), id: 'no-colon' }).success, false);
});

test('files, targets and written values', () => {
  assert.equal(fileOfId(id), 'src/tsx/sections/Pricing.tsx');
  assert.equal(targetOf(at(0)), 'tsx');
  assert.equal(targetOf(at(4)), 'scss');
  assert.deepEqual(styleText({ token: '--kit-space-md' }), {
    value: 'var(--kit-space-md)',
    offKit: false,
  });
  assert.deepEqual(styleText({ raw: '13px' }), { value: '13px', offKit: true });
});
