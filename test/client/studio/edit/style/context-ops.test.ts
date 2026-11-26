// The edit context (spec 4c, goal 1; plan 16, task A; plan 25, C6): where a row's value comes from
// at a width, in a state and with the option values shown, where an edit goes, and the ops of
// "Remove for this width", "Apply to all widths" and "Apply to all options".

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyToAllOptions,
  applyToAllWidths,
  BASE_CONTEXT,
  isBase,
  removeForContext,
  sourceAt,
  targetContext,
} from '../../../../../client/studio/edit/style/context-ops.ts';
import {
  type ContextOption,
  STYLE_PROPERTIES,
  type StyleContext,
  type StyleProperty,
  type StyleValue,
} from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Pricing:section/Stack';
const ETAG = `"${'a'.repeat(27)}"`;
const SCSS_FILE = 'src/scss/sections/pricing.scss';

/** A width and a state of every option. */
const ctxAt = (width: number | null, state: StyleContext['state'] = null): StyleContext => ({
  width,
  state,
  option: null,
});
const AT_768 = ctxAt(768);
const AT_1280 = ctxAt(1280);
const HOVER = ctxAt(null, 'hover');
const HOVER_768 = ctxAt(768, 'hover');
const HOVER_1280 = ctxAt(1280, 'hover');
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
  assert.deepEqual(sourceAt(GAPS, 'gap', ctxAt(1024)), {
    kind: 'below',
    width: 768,
    state: null,
    value: '2px',
  });
  assert.deepEqual(sourceAt(GAPS, 'gap', ctxAt(390)), {
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
  assert.deepEqual(sourceAt(GAPS, 'gap', ctxAt(768, 'active')), {
    kind: 'below',
    width: 768,
    state: null,
    value: '2px',
  });
  assert.deepEqual(sourceAt(GAPS, 'gap', ctxAt(null, 'focus-visible')), {
    kind: 'below',
    width: null,
    state: null,
    value: '1px',
  });
  // Another state's block is not this state's.
  const active = ruled([], [override(ctxAt(null, 'active'), 'gap', '5px')]);
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

// ---- Shorthands (ADR 0070) ----------------------------------------------------------------------

test('a value a shorthand of the block holds is here, with the shorthand named', () => {
  const view = ruled(
    [],
    [
      { ...override(AT_768, 'padding-top', '2px'), via: 'padding' },
      { ...override(AT_768, 'border-color', 'red'), via: 'border' },
    ],
  );
  assert.deepEqual(sourceAt(view, 'padding-top', AT_768), {
    kind: 'here',
    value: '2px',
    offKit: true,
    via: 'padding',
  });
  // At a wider width it comes from below, as any value does.
  assert.deepEqual(sourceAt(view, 'padding-top', AT_1280), {
    kind: 'below',
    width: 768,
    state: null,
    value: '2px',
  });
});

test('a side stays in the box that holds it at a width; a part of a border can leave', () => {
  const view = ruled(
    [],
    [
      { ...override(AT_768, 'padding-top', '2px'), via: 'padding' },
      { ...override(AT_768, 'border-color', 'red'), via: 'border' },
    ],
  );
  assert.equal(removeForContext(view, 'padding-top', AT_768), null);
  assert.equal(applyToAllWidths(view, 'padding-top', AT_768), null);
  // One width that holds the side in a box is enough: the others would stay behind.
  const two = ruled(
    [],
    [
      override(AT_768, 'padding-top', '2px'),
      { ...override(AT_1280, 'padding-top', '4px'), via: 'padding' },
    ],
  );
  assert.equal(applyToAllWidths(two, 'padding-top', AT_768), null);
  assert.equal(removeForContext(two, 'padding-top', AT_768)?.[0]?.op, 'removeStyle');

  assert.equal(removeForContext(view, 'border-color', AT_768)?.[0]?.op, 'removeStyle');
  assert.deepEqual(
    (applyToAllWidths(view, 'border-color', AT_768) ?? []).map((op) => op.op),
    ['setStyle', 'removeStyle'],
  );
});

// ---- Options (plan 25, C6) ----------------------------------------------------------------------

const TWO: ContextOption = { id: 'columns', value: '2' };
const FILLED: ContextOption = { id: 'cards', value: 'filled' };
/** Both values shown; the page's choice names every option, at its default or not. */
const SHOWN = { columns: '2', cards: 'filled' };
const ONLY_TWO = { columns: '2', cards: 'outlined' };

const inOption = (
  option: ContextOption,
  width: number | null = null,
  state: StyleContext['state'] = null,
): StyleContext => ({ width, state, option });

/**
 * The rule's own `1px`, `2px` at 768 and `5px` in hover; `3px` for `columns: 2` and `7px` for
 * `cards: filled`, in the file in the options' order.
 */
const OPTIONED = ruled(
  [{ property: 'gap', value: '1px', offKit: true }],
  [
    override(AT_768, 'gap', '2px'),
    override(inOption(TWO), 'gap', '3px'),
    override(inOption(FILLED), 'gap', '7px'),
    override(HOVER, 'gap', '5px'),
  ],
);

/** `view` with one more block's value, read after the others (later in the file). */
const withOverride = (view: Inspect, one: Override): Inspect => ({
  ...view,
  overrides: [...(view.overrides ?? []), one],
});

test("C6: an option's block before the rule's own, then the nearest width at or below", () => {
  assert.deepEqual(sourceAt(OPTIONED, 'gap', BASE_CONTEXT, ONLY_TWO), {
    kind: 'here',
    value: '3px',
    offKit: true,
    option: TWO,
  });
  // The option's value of every width beats the rule's own nearer 768 block.
  assert.deepEqual(sourceAt(OPTIONED, 'gap', AT_1280, ONLY_TWO), {
    kind: 'below',
    width: null,
    state: null,
    value: '3px',
    option: TWO,
  });
  // Within the option, the nearest of its widths.
  const wide = withOverride(OPTIONED, override(inOption(TWO, 768), 'gap', '6px'));
  assert.deepEqual(sourceAt(wide, 'gap', AT_1280, ONLY_TWO), {
    kind: 'below',
    width: 768,
    state: null,
    value: '6px',
    option: TWO,
  });
  // A value the page does not show takes no part: the rule's own cascade, as before options.
  assert.deepEqual(sourceAt(OPTIONED, 'gap', BASE_CONTEXT, {}), {
    kind: 'here',
    value: '1px',
    offKit: true,
  });
  assert.deepEqual(sourceAt(OPTIONED, 'gap', AT_1280), sourceAt(GAPS, 'gap', AT_1280));
});

test('C6: two shown values that set one property, the later block wins', () => {
  assert.deepEqual(sourceAt(OPTIONED, 'gap', BASE_CONTEXT, SHOWN), {
    kind: 'here',
    value: '7px',
    offKit: true,
    option: FILLED,
  });
  // The later block wins whatever its width: `cards: filled` of every width at 1280 over a
  // `columns: 2` block of 1280, as the stylesheet has them in that order.
  const late = ruled(
    [],
    [override(inOption(TWO, 1280), 'gap', '3px'), override(inOption(FILLED), 'gap', '7px')],
  );
  assert.deepEqual(sourceAt(late, 'gap', AT_1280, SHOWN), {
    kind: 'below',
    width: null,
    state: null,
    value: '7px',
    option: FILLED,
  });
});

test("C6: a state's value before every resting one, an option's too", () => {
  // The rule's own hover over the option's resting value.
  assert.deepEqual(sourceAt(OPTIONED, 'gap', HOVER, SHOWN), {
    kind: 'here',
    value: '5px',
    offKit: true,
  });
  // The option's own hover over the rule's hover.
  const hovered = withOverride(OPTIONED, override(inOption(TWO, null, 'hover'), 'gap', '4px'));
  assert.deepEqual(sourceAt(hovered, 'gap', HOVER_768, ONLY_TWO), {
    kind: 'below',
    width: null,
    state: 'hover',
    value: '4px',
    option: TWO,
  });
  // A state nothing sets shows the option's resting value.
  assert.deepEqual(sourceAt(OPTIONED, 'gap', ctxAt(null, 'active'), ONLY_TWO), {
    kind: 'below',
    width: null,
    state: null,
    value: '3px',
    option: TWO,
  });
});

test('an edit goes to the block the shown value comes from, or to the one value the bar names', () => {
  // "All options": the option's block that holds the value, at the card's width.
  assert.deepEqual(targetContext(OPTIONED, 'gap', BASE_CONTEXT, ONLY_TWO), inOption(TWO));
  assert.deepEqual(targetContext(OPTIONED, 'gap', AT_1280, ONLY_TWO), inOption(TWO, 1280));
  assert.deepEqual(targetContext(OPTIONED, 'gap', HOVER, SHOWN), HOVER);
  // The rule's own value, and a property nothing sets: every option.
  assert.deepEqual(targetContext(OPTIONED, 'gap', AT_768, {}), AT_768);
  assert.deepEqual(targetContext(OPTIONED, 'padding', AT_768, SHOWN), AT_768);
  // "Only Columns: 2" names its block, even where another value's block shows.
  assert.deepEqual(targetContext(OPTIONED, 'gap', inOption(TWO), SHOWN), inOption(TWO));
  assert.deepEqual(sourceAt(OPTIONED, 'gap', inOption(TWO), SHOWN), {
    kind: 'below',
    width: null,
    state: null,
    value: '7px',
    option: FILLED,
  });
});

test('"Remove for this option" drops the value of its block, and only that', () => {
  assert.deepEqual(removeForContext(OPTIONED, 'gap', inOption(TWO)), [
    {
      op: 'removeStyle',
      id: ID,
      className: 'plans',
      property: 'gap',
      context: inOption(TWO),
      before: { raw: '3px' },
      dropRule: false,
      dropBlock: true,
    },
  ]);
  assert.equal(removeForContext(OPTIONED, 'gap', inOption(TWO, 768)), null);
});

test('"Apply to all options" makes it the value of the rule, and drops the options\' values', () => {
  const at = { id: ID, className: 'plans', property: 'gap' };
  const drop = (context: StyleContext, raw: string) => ({
    op: 'removeStyle',
    ...at,
    context,
    before: { raw },
    dropRule: false,
    dropBlock: true,
  });
  assert.deepEqual(applyToAllOptions(OPTIONED, 'gap', inOption(TWO)), [
    { op: 'setStyle', ...at, value: { raw: '3px' }, before: { raw: '1px' }, newRule: false },
    drop(inOption(TWO), '3px'),
    drop(inOption(FILLED), '7px'),
  ]);
  // A state's value goes to the rule's own state block.
  const hover = ruled([], [override(inOption(TWO, null, 'hover'), 'gap', '4px')]);
  assert.deepEqual(applyToAllOptions(hover, 'gap', inOption(TWO, null, 'hover')), [
    {
      op: 'setStyle',
      ...at,
      context: HOVER,
      value: { raw: '4px' },
      before: null,
      newRule: false,
      newBlock: true,
    },
    drop(inOption(TWO, null, 'hover'), '4px'),
  ]);
  // Nothing without an option or a value there; an option's narrower block would still win.
  assert.equal(applyToAllOptions(OPTIONED, 'gap', AT_768), null);
  assert.equal(applyToAllOptions(OPTIONED, 'gap', inOption(TWO, 768)), null);
  const narrower = ruled(
    [],
    [override(inOption(TWO), 'gap', '3px'), override(inOption(FILLED, 768), 'gap', '8px')],
  );
  assert.equal(applyToAllOptions(narrower, 'gap', inOption(FILLED, 768)), null);
});

test('"Apply to all widths" in an option keeps to its blocks; the widths of the rule stay', () => {
  const view = ruled(
    [],
    [
      override(AT_768, 'gap', '2px'),
      override(inOption(TWO), 'gap', '3px'),
      override(inOption(TWO, 768), 'gap', '6px'),
      override(inOption(TWO, 1280), 'gap', '8px'),
    ],
  );
  const at = { id: ID, className: 'plans', property: 'gap' };
  assert.deepEqual(applyToAllWidths(view, 'gap', inOption(TWO, 768)), [
    {
      op: 'setStyle',
      ...at,
      context: inOption(TWO),
      value: { raw: '6px' },
      before: { raw: '3px' },
      newRule: false,
      newBlock: false,
    },
    {
      op: 'removeStyle',
      ...at,
      context: inOption(TWO, 768),
      before: { raw: '6px' },
      dropRule: false,
      dropBlock: true,
    },
    {
      op: 'removeStyle',
      ...at,
      context: inOption(TWO, 1280),
      before: { raw: '8px' },
      dropRule: false,
      dropBlock: true,
    },
  ]);
});

test('a Tailwind draft has no option blocks: "Apply to all options" is nothing there', () => {
  const view = classed([override(AT_768, 'padding', '6', 'md:p-6')]);
  assert.equal(applyToAllOptions(view, 'padding', inOption(TWO, 768)), null);
  assert.deepEqual(sourceAt(view, 'padding', AT_768, SHOWN), sourceAt(view, 'padding', AT_768));
});
