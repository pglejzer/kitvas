// The edit context (spec 4c, goal 1; plan 16, task A): where a row's value comes from at a width
// and in a state, and the ops of "Remove for this width" and "Apply to all widths".

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyToAllWidths,
  BASE_CONTEXT,
  isBase,
  removeForContext,
  sourceAt,
} from '../../../../../client/studio/edit/style/context-ops.ts';
import {
  STYLE_PROPERTIES,
  type StyleContext,
  type StyleProperty,
  type StyleValue,
} from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Pricing:section/Stack';
const ETAG = `"${'a'.repeat(27)}"`;
const SCSS_FILE = 'src/scss/sections/pricing.scss';

const AT_768: StyleContext = { width: 768, state: null };
const AT_1280: StyleContext = { width: 1280, state: null };
const HOVER: StyleContext = { width: null, state: 'hover' };
const HOVER_768: StyleContext = { width: 768, state: 'hover' };
const HOVER_1280: StyleContext = { width: 1280, state: 'hover' };
const MD: StyleValue = { token: '--kit-space-md' };

type Override = NonNullable<Inspect['overrides']>[number];
type Declarations = NonNullable<Inspect['scss']>['declarations'];

const override = (
  context: StyleContext,
  property: StyleProperty,
  value: string,
  utility: string | null = null,
): Override => ({
  context,
  property,
  value,
  offKit: utility === null && !value.startsWith('var('),
  utility,
});

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
    className: { kind: 'string', value: 'plans' },
    styleClass: { className: 'plans', exists: true },
    scss: { file: SCSS_FILE, etag: ETAG, rule: true, declarations: [], nested: [] },
    styles,
    ...overrides,
  };
}

/** An element of an SCSS draft: the rule `.plans` with `declarations` and the blocks' values. */
function ruled(declarations: Declarations, overrides: Override[]): Inspect {
  const view = inspected({ overrides });
  const styles = { ...view.styles };
  for (const { property, value, offKit } of declarations) {
    const name = STYLE_PROPERTIES.find((each) => each === property);
    if (name) styles[name] = { kind: 'scss', className: 'plans', value, offKit };
  }
  const scss = { file: SCSS_FILE, etag: ETAG, rule: true, declarations, nested: [] };
  return { ...view, scss, styles };
}

/** An element of a Tailwind draft: `p-4` and the prefixed classes of `overrides`. */
function classed(overrides: Override[]): Inspect {
  const view = inspected({ scss: null, styleClass: null, overrides });
  const styles = { ...view.styles, padding: { kind: 'utility' as const, className: 'p-4' } };
  return { ...view, styles };
}

const GAPS = ruled(
  [{ property: 'gap', value: '1px', offKit: true }],
  [
    override(AT_768, 'gap', '2px'),
    override(HOVER, 'gap', '3px'),
    override(HOVER_1280, 'gap', 'var(--kit-space-md)'),
  ],
);

test('a value set in exactly the context is here, with its off-kit mark', () => {
  assert.deepEqual(sourceAt(GAPS, 'gap', BASE_CONTEXT), {
    kind: 'here',
    value: '1px',
    offKit: true,
  });
  assert.deepEqual(sourceAt(GAPS, 'gap', AT_768), { kind: 'here', value: '2px', offKit: true });
  assert.deepEqual(sourceAt(GAPS, 'gap', HOVER), { kind: 'here', value: '3px', offKit: true });
  assert.deepEqual(sourceAt(GAPS, 'gap', HOVER_1280), {
    kind: 'here',
    value: 'var(--kit-space-md)',
    offKit: false,
  });
});

test('a width shows the value of the nearest block at or below it, mobile-first', () => {
  assert.deepEqual(sourceAt(GAPS, 'gap', AT_1280), {
    kind: 'below',
    width: 768,
    state: null,
    value: '2px',
  });
  // A width between two breakpoints, and one below every block.
  assert.deepEqual(sourceAt(GAPS, 'gap', { width: 1024, state: null }), {
    kind: 'below',
    width: 768,
    state: null,
    value: '2px',
  });
  assert.deepEqual(sourceAt(GAPS, 'gap', { width: 390, state: null }), {
    kind: 'below',
    width: null,
    state: null,
    value: '1px',
  });
  // A block of a wider width never reaches down.
  const wide = ruled([], [override(AT_1280, 'gap', '9px')]);
  assert.deepEqual(sourceAt(wide, 'gap', AT_768), { kind: 'kit' });
  assert.deepEqual(sourceAt(wide, 'gap', BASE_CONTEXT), { kind: 'kit' });
});

test("a state's value wins over every resting one, whatever their widths", () => {
  // `&:hover` of all widths beats the resting value of the 768 block.
  assert.deepEqual(sourceAt(GAPS, 'gap', HOVER_768), {
    kind: 'below',
    width: null,
    state: 'hover',
    value: '3px',
  });
  // A state nothing sets shows the resting value of its width.
  assert.deepEqual(sourceAt(GAPS, 'gap', { width: 768, state: 'active' }), {
    kind: 'below',
    width: 768,
    state: null,
    value: '2px',
  });
  assert.deepEqual(sourceAt(GAPS, 'gap', { width: null, state: 'focus-visible' }), {
    kind: 'below',
    width: null,
    state: null,
    value: '1px',
  });
  // Another state's block is not this state's.
  const active = ruled([], [override({ width: null, state: 'active' }, 'gap', '5px')]);
  assert.deepEqual(sourceAt(active, 'gap', HOVER), { kind: 'kit' });
});

test('a property nothing sets, and one a prop sets, come from the kit', () => {
  assert.deepEqual(sourceAt(GAPS, 'padding', AT_768), { kind: 'kit' });
  const view = inspected();
  const covered = {
    ...view,
    styles: { ...view.styles, gap: { kind: 'prop' as const, prop: 'gap' } },
  };
  assert.deepEqual(sourceAt(covered, 'gap', BASE_CONTEXT), { kind: 'kit' });
  assert.deepEqual(sourceAt(covered, 'gap', AT_768), { kind: 'kit' });
  assert.equal(isBase(BASE_CONTEXT), true);
  assert.equal(isBase(HOVER), false);
  assert.equal(isBase(AT_768), false);
});

test('a Tailwind draft cascades the same way over its prefixed classes', () => {
  const view = classed([override(AT_768, 'padding', '6', 'md:p-6')]);
  assert.deepEqual(sourceAt(view, 'padding', BASE_CONTEXT), {
    kind: 'here',
    value: 'p-4',
    offKit: false,
  });
  assert.deepEqual(sourceAt(view, 'padding', AT_768), { kind: 'here', value: '6', offKit: false });
  assert.deepEqual(sourceAt(view, 'padding', HOVER_1280), {
    kind: 'below',
    width: 768,
    state: null,
    value: '6',
  });
});

test('"Remove for this width" drops the value of the context, and only that', () => {
  assert.deepEqual(removeForContext(GAPS, 'gap', AT_768), [
    {
      op: 'removeStyle',
      id: ID,
      className: 'plans',
      property: 'gap',
      context: AT_768,
      before: { raw: '2px' },
      dropRule: false,
      dropBlock: true,
    },
  ]);
  const [hover] = removeForContext(GAPS, 'gap', HOVER_1280) ?? [];
  assert.deepEqual(hover?.op === 'removeStyle' ? [hover.context, hover.before] : null, [
    HOVER_1280,
    MD,
  ]);
  // Nothing is set there: the value shown comes from below, and is not removed from here.
  assert.equal(removeForContext(GAPS, 'gap', AT_1280), null);
  assert.equal(removeForContext(GAPS, 'padding', AT_768), null);
  // A Tailwind draft is known by its classes.
  const view = classed([override(AT_768, 'padding', '6', 'md:p-6')]);
  assert.deepEqual(removeForContext(view, 'padding', AT_768), [
    { op: 'setUtility', id: ID, value: null, before: 'md:p-6' },
  ]);
  assert.equal(removeForContext(view, 'padding', AT_1280), null);
});

test('"Apply to all widths" makes the value the base and drops every width of the state', () => {
  const view = ruled(
    [{ property: 'gap', value: '1px', offKit: true }],
    [
      override(AT_768, 'gap', 'var(--kit-space-md)'),
      override(AT_1280, 'gap', '3px'),
      override(HOVER_768, 'gap', '9px'),
    ],
  );
  const at = { id: ID, className: 'plans', property: 'gap' };
  assert.deepEqual(applyToAllWidths(view, 'gap', AT_768), [
    { op: 'setStyle', ...at, value: MD, before: { raw: '1px' }, newRule: false },
    { op: 'removeStyle', ...at, context: AT_768, before: MD, dropRule: false, dropBlock: true },
    {
      op: 'removeStyle',
      ...at,
      context: AT_1280,
      before: { raw: '3px' },
      dropRule: false,
      dropBlock: true,
    },
  ]);
  // A state's value goes to the state's block of all widths; the resting ones stay.
  assert.deepEqual(applyToAllWidths(view, 'gap', HOVER_768), [
    {
      op: 'setStyle',
      ...at,
      context: HOVER,
      value: { raw: '9px' },
      before: null,
      newRule: false,
      newBlock: true,
    },
    {
      op: 'removeStyle',
      ...at,
      context: HOVER_768,
      before: { raw: '9px' },
      dropRule: false,
      dropBlock: true,
    },
  ]);
});

test('"Apply to all widths" is nothing for the base, an unset width or a read-only base', () => {
  assert.equal(applyToAllWidths(GAPS, 'gap', BASE_CONTEXT), null);
  assert.equal(applyToAllWidths(GAPS, 'gap', HOVER), null);
  assert.equal(applyToAllWidths(GAPS, 'gap', AT_1280), null);
  assert.equal(applyToAllWidths(GAPS, 'padding', AT_768), null);
  // The base stands beside a block kitvas does not read: the overrides stay as they are.
  const nested = {
    ...GAPS,
    scss: GAPS.scss && { ...GAPS.scss, declarations: [], nested: ['gap'] },
  };
  assert.equal(applyToAllWidths(nested, 'gap', AT_768), null);
});

test('"Apply to all widths" in Tailwind keeps the class without its screen', () => {
  const view = classed([
    override(AT_768, 'padding', '6', 'md:p-6'),
    override(AT_1280, 'padding', '8', 'xl:p-8'),
    override(HOVER_768, 'padding', '2', 'md:hover:p-2'),
  ]);
  assert.deepEqual(applyToAllWidths(view, 'padding', AT_768), [
    { op: 'setUtility', id: ID, value: 'p-6', before: 'p-4' },
    { op: 'setUtility', id: ID, value: null, before: 'md:p-6' },
    { op: 'setUtility', id: ID, value: null, before: 'xl:p-8' },
  ]);
  assert.deepEqual(applyToAllWidths(view, 'padding', HOVER_768), [
    { op: 'setUtility', id: ID, value: 'hover:p-2', before: null },
    { op: 'setUtility', id: ID, value: null, before: 'md:hover:p-2' },
  ]);
  // The side's row shows `md:p-6`, which is not its own class to move.
  const side = classed([override(AT_768, 'padding-top', '6', 'md:p-6')]);
  assert.equal(applyToAllWidths(side, 'padding-top', AT_768), null);
});
