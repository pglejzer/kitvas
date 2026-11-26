import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  opsForProp,
  opsForStyle,
  readOnlyReason,
  refusalKey,
} from '../../../../../../client/studio/edit/props/panel/panel.ts';
import { STYLE_PROPERTIES } from '../../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Pricing:section/Stack';
const ETAG = `"${'a'.repeat(27)}"`;

function inspected(overrides: Partial<Inspect> = {}): Inspect {
  const styles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [property, { kind: 'kit' }]),
  ) as Inspect['styles'];
  return {
    id: ID,
    version: 2,
    hash: '0123456789abcdef',
    movable: null,
    file: 'src/tsx/sections/Pricing.tsx',
    etag: ETAG,
    tag: 'div',
    component: null,
    props: [],
    spread: false,
    text: null,
    textRefusal: null,
    className: null,
    styleClass: { className: 'plans', exists: false },
    scss: {
      file: 'src/scss/sections/pricing.scss',
      etag: ETAG,
      rule: false,
      declarations: [],
      nested: [],
    },
    styles,
    ...overrides,
  };
}

/** A Base `Stack`: `gap` is an enum prop with the names of the `space` tokens. */
function stack(overrides: Partial<Inspect> = {}): Inspect {
  const base = inspected();
  return inspected({
    tag: 'Stack',
    component: {
      name: 'Stack',
      takesClassName: true,
      props: [
        { name: 'direction', type: 'enum', values: ['row', 'column'] },
        { name: 'gap', type: 'enum', values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
      ],
    },
    styles: { ...base.styles, gap: { kind: 'prop', prop: 'gap' } },
    ...overrides,
  });
}

const MD = { token: '--kit-space-md' };
const written = (name: string, value: string): Inspect['props'][number] => ({
  name,
  kind: 'literal',
  value: { kind: 'string', value },
});

/** A card of a plans list read for its copy `[1]`: the item's own class, `plans__card--pro`. */
function itemView(inTsx: boolean): Inspect {
  return inspected({
    styleClass: { className: 'plans__card--pro', exists: true },
    itemScope: { className: 'plans__card--pro', inTsx, path: [1] },
  });
}

test('this item puts the class into the TSX first', () => {
  const ops = opsForStyle(itemView(false), 'background-color', { token: '--kit-color-ink-soft' });
  assert.deepEqual(ops[0], {
    op: 'addItemClass',
    id: ID,
    path: [1],
    className: 'plans__card--pro',
  });
  assert.equal(ops.length, 2);
  assert.equal(ops[1]?.op, 'setStyle');
  assert.equal(ops[1] && 'className' in ops[1] ? ops[1].className : null, 'plans__card--pro');
});

test('a class already in the TSX adds nothing', () => {
  const ops = opsForStyle(itemView(true), 'background-color', { token: '--kit-color-ink-soft' });
  assert.deepEqual(
    ops.map((op) => op.op),
    ['setStyle'],
  );
});

test('this item adds its class once for a write in a width context', () => {
  const ops = opsForStyle(itemView(false), 'background-color', MD_COLOR, {
    context: { width: 768, state: null, option: null },
  });
  assert.deepEqual(
    ops.map((op) => op.op),
    ['addItemClass', 'setStyle'],
  );
});

test('a refused item scope changes nothing in the ops', () => {
  const view = inspected({ itemScope: { refused: 'item-key' } });
  const ops = opsForStyle(view, 'background-color', MD_COLOR);
  assert.deepEqual(
    ops.map((op) => op.op),
    ['addClass', 'setStyle'],
  );
});

const MD_COLOR = { token: '--kit-color-ink-soft' };

test('a style whose source is a prop gives one setProp that keeps the prop in place', () => {
  const view = stack({ props: [written('direction', 'row'), written('gap', 'sm')] });
  assert.deepEqual(opsForStyle(view, 'gap', MD), [
    {
      op: 'setProp',
      id: ID,
      name: 'gap',
      value: { kind: 'string', value: 'md' },
      before: { kind: 'string', value: 'sm' },
      after: 'direction',
    },
  ]);
});

test('a Stack that does not write gap gets the prop inserted after the last prop, not CSS', () => {
  const view = stack({ props: [written('direction', 'row')] });
  assert.deepEqual(opsForStyle(view, 'gap', MD), [
    {
      op: 'setProp',
      id: ID,
      name: 'gap',
      value: { kind: 'string', value: 'md' },
      before: null,
      after: 'direction',
    },
  ]);
  const bare = opsForStyle(stack(), 'gap', MD);
  assert.equal(bare.length, 1);
  assert.equal(bare[0]?.op, 'setProp');
  assert.equal(bare[0]?.op === 'setProp' ? bare[0].after : 'x', null);
});

test('a prop source with a spread on the tag and the prop not written is read-only', () => {
  const view = stack({ spread: true });
  assert.equal(readOnlyReason(view, 'gap', 'scss'), 'spread');
  assert.deepEqual(opsForStyle(view, 'gap', MD), []);
});

test('a prop source written as an expression gives no ops and the reason computed', () => {
  const view = stack({ props: [{ name: 'gap', kind: 'expr', source: '{tone}' }] });
  assert.equal(readOnlyReason(view, 'gap', 'scss'), 'computed');
  assert.deepEqual(opsForStyle(view, 'gap', MD), []);
  assert.deepEqual(opsForProp(view, 'gap', { kind: 'string', value: 'md' }), []);
});

test('a raw value or a token the prop does not list gives no ops for a prop source', () => {
  const view = stack({ props: [written('gap', 'sm')] });
  assert.deepEqual(opsForStyle(view, 'gap', { raw: '13px' }), []);
  assert.deepEqual(opsForStyle(view, 'gap', { token: '--kit-color-ink' }), []);
});

test('resetting a prop source removes the prop and remembers the prop before it', () => {
  const view = stack({ props: [written('direction', 'row'), written('gap', 'sm')] });
  assert.deepEqual(opsForStyle(view, 'gap', null), [
    {
      op: 'removeProp',
      id: ID,
      name: 'gap',
      before: { kind: 'string', value: 'sm' },
      after: 'direction',
    },
  ]);
  assert.deepEqual(opsForStyle(stack(), 'gap', null), []);
});

test('an element with no class gets addClass, then setStyle with newRule', () => {
  assert.deepEqual(opsForStyle(inspected(), 'padding', MD), [
    { op: 'addClass', id: ID, className: 'plans' },
    {
      op: 'setStyle',
      id: ID,
      className: 'plans',
      property: 'padding',
      value: MD,
      before: null,
      newRule: true,
    },
  ]);
});

test('an element whose class has no rule yet gets only setStyle with newRule', () => {
  const view = inspected({
    className: { kind: 'string', value: 'plans' },
    styleClass: { className: 'plans', exists: true },
  });
  const ops = opsForStyle(view, 'gap', MD);
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0], {
    op: 'setStyle',
    id: ID,
    className: 'plans',
    property: 'gap',
    value: MD,
    before: null,
    newRule: true,
  });
});

test('a declaration in the rule is changed with its value as before, and no newRule', () => {
  const base = inspected();
  const view = inspected({
    styleClass: { className: 'plans', exists: true },
    styles: {
      ...base.styles,
      padding: { kind: 'scss', className: 'plans', value: 'var(--kit-space-sm)', offKit: false },
    },
    scss: {
      file: 'src/scss/sections/pricing.scss',
      etag: ETAG,
      rule: true,
      declarations: [{ property: 'padding', value: 'var(--kit-space-sm)', offKit: false }],
      nested: [],
    },
  });
  assert.deepEqual(opsForStyle(view, 'padding', { raw: '13px' }), [
    {
      op: 'setStyle',
      id: ID,
      className: 'plans',
      property: 'padding',
      value: { raw: '13px' },
      before: { token: '--kit-space-sm' },
      newRule: false,
    },
  ]);
  assert.deepEqual(opsForStyle(view, 'padding', { token: '--kit-space-sm' }), []);
  assert.deepEqual(opsForStyle(view, 'padding', null), [
    {
      op: 'removeStyle',
      id: ID,
      className: 'plans',
      property: 'padding',
      before: { token: '--kit-space-sm' },
      dropRule: false,
    },
  ]);
});

test('an off-kit declaration is read back as a raw value', () => {
  const view = inspected({
    styleClass: { className: 'plans', exists: true },
    scss: {
      file: 'src/scss/sections/pricing.scss',
      etag: ETAG,
      rule: true,
      declarations: [{ property: 'padding', value: '13px', offKit: true }],
      nested: [],
    },
  });
  const [op] = opsForStyle(view, 'padding', MD);
  assert.equal(op?.op === 'setStyle' ? JSON.stringify(op.before) : '', '{"raw":"13px"}');
});

test('a utility source gives no ops and the reason utility', () => {
  const base = inspected();
  const view = inspected({
    styles: { ...base.styles, gap: { kind: 'utility', className: 'gap-4' } },
  });
  assert.equal(readOnlyReason(view, 'gap', 'scss'), 'utility');
  assert.deepEqual(opsForStyle(view, 'gap', MD), []);
});

test('a Tailwind draft writes its style rows as utility classes since stage 4c', () => {
  assert.equal(readOnlyReason(inspected(), 'padding', 'tailwind'), null);
});

test('a kit component that takes no className cannot be styled', () => {
  const view = inspected({
    tag: 'Icon',
    component: { name: 'Icon', takesClassName: false, props: [] },
  });
  assert.equal(readOnlyReason(view, 'padding', 'scss'), 'no-classname');
  assert.deepEqual(opsForStyle(view, 'padding', MD), []);
});

test('a className built in code cannot get a class added', () => {
  const view = inspected({ className: { kind: 'expr', source: '{cls}' } });
  assert.equal(readOnlyReason(view, 'padding', 'scss'), 'computed');
  assert.deepEqual(opsForStyle(view, 'padding', MD), []);
});

test('a property set only in a nested block or a section without SCSS is read-only', () => {
  const nested = inspected({
    styleClass: { className: 'plans', exists: true },
    scss: {
      file: 'src/scss/sections/pricing.scss',
      etag: ETAG,
      rule: true,
      declarations: [],
      nested: ['padding'],
    },
  });
  assert.equal(readOnlyReason(nested, 'padding', 'scss'), 'nested');
  assert.deepEqual(opsForStyle(nested, 'padding', MD), []);
  assert.equal(readOnlyReason(inspected({ scss: null }), 'padding', 'scss'), 'not-found');
});

test('opsForProp changes a literal in place, skips the same value and removes with `after`', () => {
  const view = inspected({
    props: [written('id', 'a'), written('title', 'b'), written('className', 'c')],
  });
  assert.deepEqual(opsForProp(view, 'title', { kind: 'string', value: 'x' }), [
    {
      op: 'setProp',
      id: ID,
      name: 'title',
      value: { kind: 'string', value: 'x' },
      before: { kind: 'string', value: 'b' },
      after: 'id',
    },
  ]);
  assert.deepEqual(opsForProp(view, 'title', { kind: 'string', value: 'b' }), []);
  assert.deepEqual(opsForProp(view, 'missing', null), []);
  assert.deepEqual(opsForProp(view, 'className', { kind: 'string', value: 'z' }), []);
  const added = opsForProp(view, 'hidden', { kind: 'boolean', value: true });
  assert.equal(added[0]?.op === 'setProp' ? added[0].after : 'x', 'title');
});

test('a refused op names the row it belongs to, an addClass the style row of its gesture', () => {
  const gesture = {
    label: 'x',
    ops: opsForStyle(inspected(), 'padding', MD),
  };
  assert.equal(refusalKey({ gesture, index: 1, reason: 'invalid' }), 'style:padding');
  assert.equal(refusalKey({ gesture, index: 0, reason: 'has-class' }), 'style:padding');
  assert.equal(refusalKey({ gesture, index: 9, reason: 'invalid' }), null);
  const prop = {
    label: 'x',
    ops: opsForProp(inspected(), 'title', { kind: 'string', value: 'q' }),
  };
  assert.equal(refusalKey({ gesture: prop, index: 0, reason: 'spread' }), 'prop:title');
});
