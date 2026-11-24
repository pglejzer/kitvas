import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coveredAt,
  heldAt,
  sourceWords,
  wantedOp,
} from '../../../../../client/studio/edit/props/context.ts';
import type { StyleContext } from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Hero:section';
const TABLET: StyleContext = { width: 768, state: null };
const DESK: StyleContext = { width: 1280, state: null };

/** An inspect answer with only the fields the rows read in a context. */
const inspect = (fields: Record<string, unknown>): Inspect =>
  ({
    id: ID,
    styles: {},
    props: [],
    overrides: [],
    scss: null,
    styleClass: null,
    ...fields,
  }) as unknown as Inspect;

const padding = (value: string, context: StyleContext = TABLET) => ({
  context,
  property: 'padding',
  value,
  offKit: false,
  utility: null,
});

test('a row holds the value set in exactly its context, else none', () => {
  const view = inspect({ overrides: [padding('24px')] });
  assert.deepEqual(heldAt([view], 'padding', TABLET), {
    held: '24px',
    offKit: false,
    mixed: false,
  });
  assert.deepEqual(heldAt([view], 'padding', DESK), { held: null, offKit: false, mixed: false });
});

test('elements that hold different values in the context show as mixed', () => {
  const one = inspect({ overrides: [padding('24px')] });
  const other = inspect({ overrides: [padding('32px')] });
  assert.equal(heldAt([one, other], 'padding', TABLET).mixed, true);
  assert.equal(heldAt([one, one], 'padding', TABLET).mixed, false);
});

test('the source line says where a value in a context comes from', () => {
  const words = (source: Parameters<typeof sourceWords>[0], context: StyleContext) =>
    sourceWords(source, context);
  const here = { kind: 'here', value: '24px', offKit: false } as const;
  assert.equal(words(here, TABLET).key, 'context.source.here');
  assert.equal(words({ kind: 'kit' }, TABLET).key, 'context.source.kit');
  const base = { kind: 'below', width: null, state: null, value: '8px' } as const;
  assert.equal(words(base, TABLET).key, 'context.source.all');
  const tablet = { kind: 'below', width: 768, state: null, value: '24px' } as const;
  assert.deepEqual(words(tablet, DESK), { key: 'context.source.up', params: { width: 768 } });
  assert.equal(words(tablet, { width: 768, state: 'hover' }).key, 'context.source.default');
  assert.equal(words(base, { width: null, state: 'active' }).key, 'context.source.default');
  const hovered = { kind: 'below', width: null, state: 'hover', value: '8px' } as const;
  assert.equal(words(hovered, { width: 768, state: 'hover' }).key, 'context.source.all');
});

test('a property a prop sets is covered in every context but the base', () => {
  const view = inspect({ styles: { color: { kind: 'prop', prop: 'tone' } } });
  assert.equal(coveredAt(view, 'color', TABLET), true);
  assert.equal(coveredAt(view, 'color', { width: null, state: 'hover' }), true);
  assert.equal(coveredAt(view, 'color', { width: null, state: null }), false);
  assert.equal(coveredAt(inspect({}), 'color', TABLET), false);
});

test('a pick on a covered property is the edit Claude is asked for, in its context', () => {
  const view = inspect({
    scss: { file: 'src/scss/sections/Hero.module.scss', rule: null, declarations: [] },
    styleClass: { className: 'hero' },
  });
  assert.deepEqual(wantedOp(view, 'color', { token: '--kit-color-ink' }, TABLET), {
    op: 'setStyle',
    id: ID,
    className: 'hero',
    property: 'color',
    value: { token: '--kit-color-ink' },
    before: null,
    newRule: true,
    context: TABLET,
    newBlock: true,
  });
  assert.equal(wantedOp(inspect({}), 'color', { raw: 'red' }, TABLET), null);
});
