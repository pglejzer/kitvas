import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEditStudio } from '../../../../../client/channel/edit-protocol.ts';
import { previewContext, previewOf } from '../../../../../client/studio/edit/style/preview-of.ts';
import {
  type EditOp,
  type StyleContext,
  type StyleValue,
  styleText,
} from '../../../../../src/edit/index.ts';

const ID = 'sections/Pricing:section/Stack/Card.2';
const STYLE = { id: ID, className: 'card', property: 'gap' };

test('a text change previews as the new text', () => {
  const op: EditOp = { op: 'setText', id: ID, value: 'Zażółć', before: 'Hello' };
  assert.deepEqual(previewOf(op), { id: ID, kind: 'text', value: 'Zażółć' });
});

test('a token previews as its variable', () => {
  const op: EditOp = {
    op: 'setStyle',
    ...STYLE,
    value: { token: '--kit-space-md' },
    before: null,
    newRule: true,
  };
  assert.deepEqual(previewOf(op), {
    id: ID,
    kind: 'style',
    property: 'gap',
    value: 'var(--kit-space-md)',
  });
});

test('a raw value previews as typed, without the off-kit marker', () => {
  const op: EditOp = {
    op: 'setStyle',
    ...STYLE,
    value: { raw: '13px' },
    before: { token: '--kit-space-md' },
    newRule: false,
  };
  assert.deepEqual(previewOf(op), { id: ID, kind: 'style', property: 'gap', value: '13px' });
});

test('the previewed style value is the one the server writes', () => {
  const values: StyleValue[] = [{ token: '--kit-color-ink-mid' }, { raw: 'calc(1rem + 2px)' }];
  for (const value of values) {
    const op: EditOp = { op: 'setStyle', ...STYLE, value, before: null, newRule: false };
    const shown = previewOf(op);
    assert.equal(shown?.kind === 'style' ? shown.value : null, styleText(value).value);
  }
});

test('a removed declaration has no preview: the build shows what the sheet falls back to', () => {
  const op: EditOp = { op: 'removeStyle', ...STYLE, before: { raw: '13px' }, dropRule: false };
  assert.equal(previewOf(op), null);
});

test('an op of a width, a state or an option value names the cards its preview is for', () => {
  const wide = { width: 768, state: null, option: null };
  const hover = { width: null, state: 'hover' as const, option: null };
  const dark = { width: null, state: null, option: { id: 'theme', value: 'dark' } };
  const set = (context?: StyleContext): EditOp => ({
    op: 'setStyle',
    ...STYLE,
    value: { raw: '13px' },
    before: null,
    newRule: false,
    ...(context === undefined ? {} : { context }),
  });
  assert.deepEqual(previewContext(set(wide)), wide);
  assert.deepEqual(previewContext(set(hover)), hover);
  assert.deepEqual(previewContext(set(dark)), dark);
  // The base, written out or left out, is every card's.
  assert.equal(previewContext(set()), null);
  assert.equal(previewContext(set({ width: null, state: null, option: null })), null);
  assert.equal(previewContext({ op: 'addClass', id: ID, className: 'card' }), null);
  assert.equal(previewContext({ op: 'setUtility', id: ID, value: 'md:p-6', before: null }), null);
  // The value itself previews as in the base.
  assert.deepEqual(previewOf(set(wide)), { id: ID, kind: 'style', property: 'gap', value: '13px' });
  assert.equal(previewOf({ op: 'setUtility', id: ID, value: 'md:p-6', before: null }), null);
});

test('adding and removing a class preview as the class on and off', () => {
  assert.deepEqual(previewOf({ op: 'addClass', id: ID, className: 'card' }), {
    id: ID,
    kind: 'class',
    className: 'card',
    on: true,
  });
  assert.deepEqual(previewOf({ op: 'removeClass', id: ID, className: 'card' }), {
    id: ID,
    kind: 'class',
    className: 'card',
    on: false,
  });
});

test('a prop has no preview: it needs the build', () => {
  const value = { kind: 'string', value: 'sm' } as const;
  const before = { kind: 'string', value: 'md' } as const;
  const set: EditOp = { op: 'setProp', id: ID, name: 'size', value, before, after: null };
  const remove: EditOp = { op: 'removeProp', id: ID, name: 'size', before, after: null };
  assert.equal(previewOf(set), null);
  assert.equal(previewOf(remove), null);
});

test('a raw value the channel would refuse has no preview, so the others still arrive', () => {
  for (const raw of ['min(1px, 2px) <', 'a > b', `1px ${'0 '.repeat(100)}`.trim()]) {
    const op: EditOp = { op: 'setStyle', ...STYLE, value: { raw }, before: null, newRule: false };
    assert.equal(previewOf(op), null, raw);
  }
});

test('every preview passes the channel check', () => {
  const ops: EditOp[] = [
    { op: 'setText', id: ID, value: 'x'.repeat(2000), before: '' },
    { op: 'setStyle', ...STYLE, value: { raw: 'x'.repeat(200) }, before: null, newRule: false },
    { op: 'setStyle', ...STYLE, value: { token: '--kit-space-md' }, before: null, newRule: false },
    { op: 'addClass', id: ID, className: 'card-2' },
    { op: 'removeClass', id: ID, className: 'card-2' },
  ];
  const changes = ops.map(previewOf);
  assert.ok(changes.every((change) => change !== null));
  const parsed = parseEditStudio({ type: 'preview', changes }, 'c');
  assert.deepEqual(parsed, { kitvas: 1, channel: 'c', type: 'preview', changes });
});
