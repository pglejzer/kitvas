import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  opsForHandle,
  pxOf,
  readHandleNote,
  scalesOf,
  styleOfHandle,
} from '../../../client/studio/edit/handle-writes.ts';
import { STYLE_PROPERTIES, type TokenOption } from '../../../src/edit/index.ts';
import type { Inspect } from '../../../src/studio/api/edit-schemas.ts';

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

function token(path: string, css: string): TokenOption {
  return { var: `--kit-${path.replaceAll('.', '-')}`, path, type: 'dimension', css };
}

const TOKENS = [
  token('space.md', '0.75rem'),
  token('space.xs', '4px'),
  token('size.page', '60rem'),
  token('size.wide', '100%'),
  token('size.narrow', '20rem'),
];

test('the scales sent to the frame are ordered, with px from the token value', () => {
  const { space, size } = scalesOf(TOKENS);
  assert.deepEqual(
    space.map((step) => [step.name, step.px]),
    [
      ['xs', 4],
      ['md', 12],
    ],
  );
  assert.equal(space[1]?.var, '--kit-space-md');
  assert.deepEqual(
    size.map((step) => step.name),
    ['narrow', 'page'],
  );
});

test('lengths that are not pixels are left out of the scales', () => {
  assert.equal(pxOf('100%'), null);
  assert.equal(pxOf('calc(1px + 2px)'), null);
  assert.equal(pxOf('1.5rem'), 24);
  assert.equal(pxOf('0'), 0);
});

test('a handle property maps to a style row; since plan 15 one padding side has its own', () => {
  assert.equal(styleOfHandle('gap'), 'gap');
  assert.equal(styleOfHandle('padding-inline'), 'padding-inline');
  assert.equal(styleOfHandle('padding-top'), 'padding-top');
  assert.equal(styleOfHandle('padding-left'), 'padding-left');
  assert.equal(styleOfHandle('opacity'), null);
});

test('a one-side padding handle writes that side; with Alt the frame sends the axis', () => {
  const view = inspected({ styleClass: { className: 'plans', exists: true } });
  for (const property of ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']) {
    const made = opsForHandle(view, property, { token: '--kit-space-md' }, 'scss');
    assert.ok('ops' in made, property);
    assert.deepEqual(
      made.ops.map((op) => [op.op, op.op === 'setStyle' ? op.property : null]),
      [['setStyle', property]],
    );
  }
  const axis = opsForHandle(view, 'padding-block', { token: '--kit-space-md' }, 'scss');
  assert.ok('ops' in axis);
  assert.equal(axis.ops[0]?.op === 'setStyle' ? axis.ops[0].property : null, 'padding-block');
});

test('a note for the panel is read only from a well-formed event detail', () => {
  assert.deepEqual(readHandleNote({ id: ID, key: 'handles.readOnly' }), {
    id: ID,
    key: 'handles.readOnly',
  });
  assert.deepEqual(readHandleNote({ id: ID, key: null }), { id: ID, key: null });
  for (const bad of [null, 'x', { id: ID }, { id: 3, key: null }, { id: ID, key: 4 }]) {
    assert.equal(readHandleNote(bad), null, JSON.stringify(bad));
  }
});

test('a gap handle on a Stack writes the prop, not CSS', () => {
  const view = inspected({
    tag: 'Stack',
    component: {
      name: 'Stack',
      takesClassName: true,
      props: [{ name: 'gap', type: 'enum', values: ['none', 'xs', 'sm', 'md', 'lg'] }],
    },
    props: [{ name: 'gap', kind: 'literal', value: { kind: 'string', value: 'xs' } }],
    styles: { ...inspected().styles, gap: { kind: 'prop', prop: 'gap' } },
  });
  assert.deepEqual(opsForHandle(view, 'gap', { token: '--kit-space-md' }, 'scss'), {
    ops: [
      {
        op: 'setProp',
        id: ID,
        name: 'gap',
        value: { kind: 'string', value: 'md' },
        before: { kind: 'string', value: 'xs' },
        after: null,
      },
    ],
  });
});

test('a width handle on a kit source adds the class first, then sets the style', () => {
  const made = opsForHandle(inspected(), 'width', { token: '--kit-size-page' }, 'scss');
  assert.ok('ops' in made);
  assert.deepEqual(
    made.ops.map((op) => op.op),
    ['addClass', 'setStyle'],
  );
  const set = made.ops[1];
  assert.deepEqual(set && 'value' in set ? set.value : null, { token: '--kit-size-page' });
});

test('an existing class gets the style without addClass', () => {
  const view = inspected({ styleClass: { className: 'plans', exists: true } });
  const made = opsForHandle(view, 'height', { raw: '120px' }, 'scss');
  assert.ok('ops' in made);
  assert.deepEqual(
    made.ops.map((op) => op.op),
    ['setStyle'],
  );
});

test('a Tailwind draft writes nothing and says so', () => {
  assert.deepEqual(opsForHandle(inspected(), 'gap', { raw: '9px' }, 'tailwind'), {
    note: 'handles.readOnly',
  });
});

test('a property that is no row and a prop that lists no such value give notes', () => {
  assert.deepEqual(opsForHandle(inspected(), 'opacity', { raw: '9px' }, 'scss'), {
    note: 'handles.notWritten',
  });
  const view = inspected({
    component: {
      name: 'Stack',
      takesClassName: true,
      props: [{ name: 'gap', type: 'enum', values: ['sm'] }],
    },
    styles: { ...inspected().styles, gap: { kind: 'prop', prop: 'gap' } },
  });
  assert.deepEqual(opsForHandle(view, 'gap', { raw: '13px' }, 'scss'), {
    note: 'handles.notWritten',
  });
});
