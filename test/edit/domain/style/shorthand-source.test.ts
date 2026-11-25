import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VarKind } from '../../../../src/edit/domain/style/shorthand.ts';
import {
  answerFor,
  type Said,
  untyped,
  varKindOf,
} from '../../../../src/edit/domain/style/shorthand-source.ts';

const say = (property: string, value: string, offKit = false): Said => ({
  property,
  value,
  offKit,
});
const same = (each: Said): Said => each;
const kinds: VarKind = (name) => (name.startsWith('--kit-color-') ? 'color' : null);

// ---- Which declaration answers ------------------------------------------------------------------

test('nothing answers for a property no declaration sets', () => {
  const all = [say('gap', '8px'), say('border-top', '1px solid red')];
  assert.deepEqual(answerFor(all, 'border-color', same, kinds), { kind: 'none', after: null });
  assert.deepEqual(answerFor([], 'padding-top', same, kinds), { kind: 'none', after: null });
});

test('the last declaration of the property itself answers when no shorthand follows it', () => {
  const first = say('border-color', 'red');
  const last = say('border-color', 'blue');
  const all = [first, say('border', '1px solid #ddd'), last];
  assert.deepEqual(answerFor(all, 'border-color', same, kinds), {
    kind: 'own',
    declaration: last,
  });
});

test('a shorthand written after the property holds it, with its part', () => {
  const border = say('border', '1px solid #ddd');
  const all = [say('border-color', 'red'), border];
  assert.deepEqual(answerFor(all, 'border-color', same, kinds), {
    kind: 'part',
    declaration: border,
    via: 'border',
    value: '#ddd',
    offKit: false,
  });
});

test('the shorthand written last answers, a narrow one after a wide one too', () => {
  const padding = say('padding', '8px');
  const block = say('padding-block', '16px 24px');
  const all = [padding, block];
  assert.deepEqual(answerFor(all, 'padding-bottom', same, kinds), {
    kind: 'part',
    declaration: block,
    via: 'padding-block',
    value: '24px',
    offKit: false,
  });
  assert.deepEqual(answerFor(all, 'padding-left', same, kinds), {
    kind: 'part',
    declaration: padding,
    via: 'padding',
    value: '8px',
    offKit: false,
  });
  // The pair is a property of its own: its declaration after the box wins.
  assert.deepEqual(answerFor(all, 'padding-block', same, kinds), {
    kind: 'own',
    declaration: block,
  });
  assert.deepEqual(answerFor([block, padding], 'padding-block', same, kinds), {
    kind: 'part',
    declaration: padding,
    via: 'padding',
    value: '8px',
    offKit: false,
  });
});

test('a shorthand that does not split holds nothing: the property reads as without it', () => {
  const gradient = say('background', 'linear-gradient(#fff, #000)');
  assert.deepEqual(answerFor([gradient], 'background-color', same, kinds), {
    kind: 'none',
    after: { declaration: gradient, via: 'background', open: false },
  });
  const own = say('background-color', 'red');
  assert.deepEqual(answerFor([own, gradient], 'background-color', same, kinds), {
    kind: 'own',
    declaration: own,
  });
});

test('a shorthand that leaves the part out is open to it', () => {
  const border = say('border', '1px solid');
  assert.deepEqual(answerFor([border], 'border-color', same, kinds), {
    kind: 'none',
    after: { declaration: border, via: 'border', open: true },
  });
  assert.deepEqual(answerFor([border], 'border-width', same, kinds).kind, 'part');
});

test('a var is typed by the reader that asks', () => {
  const border = say('border', '1px solid var(--kit-color-line)');
  assert.equal(answerFor([border], 'border-color', same, kinds).kind, 'part');
  assert.deepEqual(answerFor([border], 'border-color', same, untyped), {
    kind: 'none',
    after: { declaration: border, via: 'border', open: false },
  });
});

test('a part is off-kit when the declaration has the marker and the part is a raw value', () => {
  const marked = say('border', '1px solid var(--kit-color-line)', true);
  const part = (property: 'border-width' | 'border-style' | 'border-color'): boolean | null => {
    const answer = answerFor([marked], property, same, kinds);
    return answer.kind === 'part' ? answer.offKit : null;
  };
  assert.equal(part('border-width'), true);
  assert.equal(part('border-style'), false);
  assert.equal(part('border-color'), false);
  // Without the marker nothing is off-kit, as a whole value reads.
  const plain = answerFor([say('border', '1px solid #ddd')], 'border-color', same, kinds);
  assert.equal(plain.kind === 'part' && plain.offKit, false);
});

test('the reader names each declaration: any shape answers', () => {
  const rows = [
    { name: 'PADDING', css: '8px 16px' },
    { name: 'gap', css: '4px' },
  ];
  type Row = { name: string; css: string };
  const lower = (row: Row): Said => say(row.name.toLowerCase(), row.css);
  const answer = answerFor(rows, 'padding-right', lower, kinds);
  assert.deepEqual(answer, {
    kind: 'part',
    declaration: rows[0],
    via: 'padding',
    value: '16px',
    offKit: false,
  });
});

// ---- Token types --------------------------------------------------------------------------------

const groups = {
  dimension: { space: ['sm', 'md'], 'border.width': ['sm'] },
  color: { color: ['line', 'inkMid'], 'color.brand': ['500'] },
  fontWeight: { weight: ['bold'] },
};

test('a kit var is a dimension or a colour by the token it names', () => {
  const kindOf = varKindOf(groups);
  assert.equal(kindOf('--kit-space-md'), 'dimension');
  assert.equal(kindOf('--kit-border-width-sm'), 'dimension');
  assert.equal(kindOf('--kit-color-line'), 'color');
  assert.equal(kindOf('--kit-color-brand-500'), 'color');
  // The variable is the token's path in kebab case.
  assert.equal(kindOf('--kit-color-ink-mid'), 'color');
});

test('a var of another type, of no token or of no kit is not typed', () => {
  const kindOf = varKindOf(groups);
  assert.equal(kindOf('--kit-weight-bold'), null);
  assert.equal(kindOf('--kit-space-xl'), null);
  assert.equal(kindOf('--space-md'), null);
  assert.equal(kindOf('--kit-'), null);
  assert.equal(varKindOf({})('--kit-space-md'), null);
  assert.equal(untyped('--kit-space-md'), null);
});

test('a name two tokens of different types share is not typed', () => {
  const kindOf = varKindOf({ dimension: { a: ['b-c'] }, color: { 'a.b': ['c'] } });
  assert.equal(kindOf('--kit-a-b-c'), null);
  const twice = varKindOf({ dimension: { a: ['b-c'], 'a.b': ['c'] } });
  assert.equal(twice('--kit-a-b-c'), 'dimension');
});
