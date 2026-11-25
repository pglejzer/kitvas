// Variants as panel edits (spec 4d, goal 2; plan 17, task B): each kind of change becomes the ops
// the properties panel would send for it, against the element as it is now; a change the panel
// would refuse makes the variant invalid with the reason; the "changes text" sign.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type BuiltVariant,
  buildVariant,
  dropsWords,
  type ElementView,
  panelValue,
  reasonKey,
  type VariantEnv,
  variantIds,
} from '../../../../../client/studio/edit/ai/variants.ts';
import {
  STYLE_PROPERTIES,
  type StyleContext,
  type StyleProperty,
  type StyleValue,
  type TokenOption,
} from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import type { VariantChange } from '../../../../../src/studio/api/requests/request-schemas.ts';

const ID = 'sections/Pricing:section/Stack';
const OTHER = 'sections/Pricing:section/Stack/Text';
const ETAG = `"${'a'.repeat(27)}"`;
const SCSS_FILE = 'src/scss/sections/pricing.scss';
const BASE: StyleContext = { width: null, state: null };
const AT_768: StyleContext = { width: 768, state: null };
const MD: StyleValue = { token: '--kit-space-md' };
const TOKENS: TokenOption[] = [
  { var: '--kit-space-md', path: 'space.md', type: 'dimension', css: '12px' },
];
const TAILWIND: Partial<VariantEnv> = { format: 'tailwind' };

type Declarations = NonNullable<Inspect['scss']>['declarations'];

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
    scss: { file: SCSS_FILE, etag: ETAG, rule: false, declarations: [], nested: [] },
    styles,
    ...overrides,
  };
}

/** An element whose class `name` has a rule with `declarations`. */
function ruled(id: string, name: string, declarations: Declarations = []): Inspect {
  return inspected({
    id,
    className: { kind: 'string', value: name },
    styleClass: { className: name, exists: true },
    scss: { file: SCSS_FILE, etag: ETAG, rule: true, declarations, nested: [] },
  });
}

/** A Base `Stack`: `direction` and `justify` cover the flex keywords. */
function stack(overrides: Partial<Inspect> = {}): Inspect {
  const base = inspected();
  return inspected({
    tag: 'Stack',
    component: {
      name: 'Stack',
      takesClassName: true,
      props: [
        { name: 'direction', type: 'enum', values: ['column', 'row'], default: 'column' },
        { name: 'justify', type: 'enum', values: ['start', 'center', 'end', 'between'] },
        { name: 'onClick', type: 'callback' },
      ],
    },
    styles: {
      ...base.styles,
      'flex-direction': { kind: 'prop', prop: 'direction' },
      'justify-content': { kind: 'prop', prop: 'justify' },
    },
    ...overrides,
  });
}

const literal = (name: string, value: string): Inspect['props'][number] => ({
  name,
  kind: 'literal',
  value: { kind: 'string', value },
});

function env(
  views: readonly Inspect[] | Map<string, ElementView>,
  more: Partial<VariantEnv> = {},
): VariantEnv {
  const known =
    views instanceof Map ? views : new Map<string, ElementView>(views.map((v) => [v.id, v]));
  return { views: known, format: 'scss', context: BASE, tokens: TOKENS, locked: [], ...more };
}

const style = (property: StyleProperty, value: StyleValue, id = ID): VariantChange => ({
  kind: 'style',
  id,
  property,
  value,
});

const variant = (...changes: VariantChange[]): { changes: VariantChange[] } => ({ changes });

/** The reason of an invalid variant, else its kind. */
const outcome = (built: BuiltVariant): string =>
  built.kind === 'invalid' ? built.problem.reason : built.kind;

const opsOf = (built: BuiltVariant): unknown => (built.kind === 'ready' ? built.ops : built);

test('a style change is the panel setStyle, with the class first when the element has none', () => {
  assert.deepEqual(buildVariant(variant(style('gap', MD)), env([inspected()])), {
    kind: 'ready',
    ids: [ID],
    ops: [
      { op: 'addClass', id: ID, className: 'plans' },
      {
        op: 'setStyle',
        id: ID,
        className: 'plans',
        property: 'gap',
        value: MD,
        before: null,
        newRule: true,
      },
    ],
    dropsText: false,
    offKit: false,
  });
});

test('two properties of an element without a class add the class once (live check, plan 17)', () => {
  const built = buildVariant(
    variant(style('gap', MD), style('padding-inline', MD)),
    env([inspected()]),
  );
  assert.equal(built.kind, 'ready');
  const ops = built.kind === 'ready' ? built.ops : [];
  assert.deepEqual(
    ops.map((op) => op.op),
    ['addClass', 'setStyle', 'setStyle'],
  );
});

test("the before value is the element's value now, never the one Claude saw", () => {
  const view = ruled(ID, 'plans', [
    { property: 'gap', value: 'var(--kit-space-sm)', offKit: false },
  ]);
  assert.deepEqual(opsOf(buildVariant(variant(style('gap', MD)), env([view]))), [
    {
      op: 'setStyle',
      id: ID,
      className: 'plans',
      property: 'gap',
      value: MD,
      before: { token: '--kit-space-sm' },
      newRule: false,
    },
  ]);
});

test("a request made at a width writes into that width's block", () => {
  const atWidth = env([ruled(ID, 'plans')], { context: AT_768 });
  assert.deepEqual(opsOf(buildVariant(variant(style('gap', MD)), atWidth)), [
    {
      op: 'setStyle',
      id: ID,
      className: 'plans',
      property: 'gap',
      context: AT_768,
      value: MD,
      before: null,
      newRule: false,
      newBlock: true,
    },
  ]);
});

test('a keyword is written plain, a raw length keeps the off-kit marker, var() is a token', () => {
  assert.deepEqual(panelValue('display', { raw: 'flex' }), { raw: 'flex', mark: false });
  assert.deepEqual(panelValue('padding', { raw: '13px', mark: false }), { raw: '13px' });
  assert.deepEqual(panelValue('padding', { raw: 'var(--kit-space-md)' }), MD);
  const keyword = buildVariant(variant(style('display', { raw: 'flex' })), env([inspected()]));
  assert.equal(keyword.kind, 'ready');
  assert.equal(keyword.kind === 'ready' && keyword.offKit, false);
  const length = buildVariant(variant(style('padding', { raw: '13px' })), env([inspected()]));
  assert.equal(length.kind === 'ready' && length.offKit, true);
  const wrong = buildVariant(variant(style('display', { raw: 'flexy' })), env([inspected()]));
  assert.deepEqual(wrong, {
    kind: 'invalid',
    ids: [ID],
    problem: { change: 0, id: ID, reason: 'value' },
  });
});

test("a style a kit prop covers is written as the prop, in the kit's word", () => {
  const view = stack({ props: [literal('direction', 'row')] });
  const between = variant(style('justify-content', { raw: 'space-between' }));
  assert.deepEqual(opsOf(buildVariant(between, env([view]))), [
    {
      op: 'setProp',
      id: ID,
      name: 'justify',
      value: { kind: 'string', value: 'between' },
      before: null,
      after: 'direction',
    },
  ]);
  // The prop has no word for it: the panel could not write it either.
  const around = variant(style('justify-content', { raw: 'space-around' }));
  assert.equal(outcome(buildVariant(around, env([view]))), 'value');
});

test('a change that is in place already gives nothing to apply', () => {
  const covered = stack({ props: [literal('justify', 'between')] });
  const asProp = variant(style('justify-content', { raw: 'space-between' }));
  assert.equal(outcome(buildVariant(asProp, env([covered]))), 'same');
  const declared = ruled(ID, 'plans', [{ property: 'gap', value: '13px', offKit: true }]);
  const raw = variant(style('gap', { raw: '13px' }));
  assert.equal(outcome(buildVariant(raw, env([declared]))), 'same');
});

test('a value a shorthand holds is read as its part: before is the part, the same value is in place', () => {
  // `padding: 8px 16px` holds `padding-left` as 16px (ADR 0070).
  const view = ruled(ID, 'plans', [{ property: 'padding', value: '8px 16px', offKit: true }]);
  view.styles = {
    ...view.styles,
    'padding-left': {
      kind: 'scss',
      className: 'plans',
      value: '16px',
      offKit: true,
      via: 'padding',
    },
  };
  assert.deepEqual(
    opsOf(buildVariant(variant(style('padding-left', { raw: '12px' })), env([view]))),
    [
      {
        op: 'setStyle',
        id: ID,
        className: 'plans',
        property: 'padding-left',
        value: { raw: '12px' },
        before: { raw: '16px' },
        newRule: false,
      },
    ],
  );
  const same = variant(style('padding-left', { raw: '16px' }));
  assert.equal(outcome(buildVariant(same, env([view]))), 'same');
  // The same in a width's block: its shorthand part is listed in `overrides`.
  const wide = {
    ...view,
    overrides: [
      {
        context: AT_768,
        property: 'padding-left' as const,
        value: '16px',
        offKit: true,
        utility: null,
        via: 'padding' as const,
      },
    ],
  };
  assert.equal(outcome(buildVariant(same, env([wide], { context: AT_768 }))), 'same');
});

test('a style the panel shows read-only makes the variant invalid with its reason', () => {
  const center = variant(style('justify-content', { raw: 'center' }));
  const atWidth = env([stack()], { context: AT_768 });
  assert.equal(outcome(buildVariant(center, atWidth)), 'prop-covered');
  const nested = inspected({
    className: { kind: 'string', value: 'plans' },
    styleClass: { className: 'plans', exists: true },
    scss: { file: SCSS_FILE, etag: ETAG, rule: true, declarations: [], nested: ['gap'] },
  });
  assert.equal(outcome(buildVariant(variant(style('gap', MD)), env([nested]))), 'nested');
  const closed = inspected({
    tag: 'Card',
    component: { name: 'Card', takesClassName: false, props: [] },
  });
  assert.equal(outcome(buildVariant(variant(style('gap', MD)), env([closed]))), 'no-classname');
});

test('a prop change is the panel setProp, checked against the kit catalog', () => {
  const prop = (name: string, value: string): VariantChange => ({
    kind: 'prop',
    id: ID,
    name,
    value: { kind: 'string', value },
  });
  assert.deepEqual(opsOf(buildVariant(variant(prop('direction', 'row')), env([stack()]))), [
    {
      op: 'setProp',
      id: ID,
      name: 'direction',
      value: { kind: 'string', value: 'row' },
      before: null,
      after: null,
    },
  ]);
  const of = (view: Inspect, change: VariantChange, more: Partial<VariantEnv> = {}): string =>
    outcome(buildVariant(variant(change), env([view], more)));
  assert.equal(of(stack(), prop('direction', 'diagonal')), 'value');
  assert.equal(of(stack(), prop('onClick', 'go')), 'value');
  const coded = stack({ props: [{ name: 'direction', kind: 'expr', source: 'dir' }] });
  assert.equal(of(coded, prop('direction', 'row')), 'computed');
  assert.equal(of(stack(), prop('direction', 'row'), { context: AT_768 }), 'prop-context');
  const same = stack({ props: [literal('direction', 'row')] });
  assert.equal(of(same, prop('direction', 'row')), 'same');
  // A plain element takes a prop the catalog does not list, as `opsForProp` writes it.
  assert.equal(of(inspected(), prop('aria-label', 'Close')), 'ready');
});

test('a text change is setText with the text there now as before, trimmed', () => {
  const view = inspected({ text: 'Buy now' });
  const text = (value: string): VariantChange => ({ kind: 'text', id: ID, value });
  assert.deepEqual(buildVariant(variant(text('  Buy it now ')), env([view])), {
    kind: 'ready',
    ids: [ID],
    ops: [{ op: 'setText', id: ID, value: 'Buy it now', before: 'Buy now' }],
    dropsText: false,
    offKit: false,
  });
  const of = (target: Inspect, value: string): string =>
    outcome(buildVariant(variant(text(value)), env([target])));
  assert.equal(of(inspected(), 'Hello'), 'no-text');
  assert.equal(of(view, '<b>Buy</b>'), 'text');
  assert.equal(of(view, '   '), 'text');
  assert.equal(of(view, 'Buy now'), 'same');
});

test('a text change that drops a word of the text carries the "changes text" sign', () => {
  const view = inspected({ text: 'Buy now' });
  const built = buildVariant(variant({ kind: 'text', id: ID, value: 'Buy' }), env([view]));
  assert.equal(built.kind === 'ready' && built.dropsText, true);
  assert.equal(dropsWords('Buy now', 'Buy'), true);
  assert.equal(dropsWords('Buy now', 'Buy it now'), false);
  assert.equal(dropsWords('Buy now', 'BUY NOW!'), false);
  assert.equal(dropsWords('Zażółć gęślą', 'zażółć'), true);
});

test("a utility change is the Tailwind op, against the element's classes now", () => {
  const view = inspected({ className: { kind: 'string', value: 'p-4 text-sm' } });
  const utility = (value: string | null, before: string | null): VariantChange => ({
    kind: 'utility',
    id: ID,
    value,
    before,
  });
  assert.deepEqual(opsOf(buildVariant(variant(utility('p-6', 'p-4')), env([view], TAILWIND))), [
    { op: 'setUtility', id: ID, value: 'p-6', before: 'p-4' },
  ]);
  const of = (change: VariantChange, more: Partial<VariantEnv>, target = view): string =>
    outcome(buildVariant(variant(change), env([target], more)));
  assert.equal(of(utility('p-6', 'p-4'), {}), 'format');
  assert.equal(of(utility('p-6', 'p-2'), TAILWIND), 'utility-gone');
  assert.equal(of(utility('text-sm', null), TAILWIND), 'same');
  const coded = inspected({ className: { kind: 'expr', source: 'classes' } });
  assert.equal(of(utility('p-6', null), TAILWIND, coded), 'computed');
});

test('a style change in a Tailwind draft swaps the property utility for the kit token', () => {
  const base = inspected();
  const view = inspected({
    className: { kind: 'string', value: 'p-4' },
    styles: { ...base.styles, padding: { kind: 'utility', className: 'p-4' } },
  });
  assert.deepEqual(opsOf(buildVariant(variant(style('padding', MD)), env([view], TAILWIND))), [
    { op: 'setUtility', id: ID, value: 'p-md', before: 'p-4' },
  ]);
  const done = inspected({
    className: { kind: 'string', value: 'p-md' },
    styles: { ...base.styles, padding: { kind: 'utility', className: 'p-md' } },
  });
  const again = variant(style('padding', MD));
  assert.equal(outcome(buildVariant(again, env([done], TAILWIND))), 'same');
});

test('an element still being read waits; a gone, unread or locked one makes it invalid', () => {
  const change = variant(style('gap', MD));
  assert.deepEqual(buildVariant(change, env([])), { kind: 'loading', ids: [ID] });
  for (const view of ['gone', 'unread'] as const) {
    const built = buildVariant(change, env(new Map<string, ElementView>([[ID, view]])));
    assert.deepEqual(built, {
      kind: 'invalid',
      ids: [ID],
      problem: { change: 0, id: ID, reason: view },
    });
  }
  assert.equal(outcome(buildVariant(change, env([inspected()], { locked: [ID] }))), 'locked');
});

test('a shared rule gets one declaration; two values for one thing make it invalid', () => {
  const both = env([ruled(ID, 'card'), ruled(OTHER, 'card')]);
  const shared = buildVariant(variant(style('gap', MD, ID), style('gap', MD, OTHER)), both);
  assert.equal(shared.kind === 'ready' && shared.ops.length, 1);
  assert.deepEqual(shared.kind === 'ready' ? shared.ids : [], [ID, OTHER]);
  const other = variant(style('gap', MD, ID), style('gap', { raw: '13px' }, OTHER));
  const clash = buildVariant(other, both);
  assert.deepEqual(clash.kind === 'invalid' ? clash.problem : clash, {
    change: 1,
    id: OTHER,
    reason: 'twice',
  });
});

test('a variant with more ops than one edit request carries is invalid', () => {
  const views = Array.from({ length: 26 }, (_, n) =>
    inspected({ id: `${ID}.${n}`, styleClass: { className: `c${n}`, exists: false } }),
  );
  const changes = views.map((view) => style('gap', MD, view.id));
  assert.equal(outcome(buildVariant({ changes }, env(views))), 'too-many');
});

test("the panel's reasons keep its words; a variant's own reasons have theirs", () => {
  assert.equal(reasonKey('computed'), 'props.reason.computed');
  assert.equal(reasonKey('prop-covered'), 'props.reason.prop-covered');
  assert.equal(reasonKey('no-text'), 'props.reason.no-text');
  assert.equal(reasonKey('gone'), 'ai.reason.gone');
  assert.equal(reasonKey('prop-context'), 'ai.reason.prop-context');
});

test('the elements of a variant are named once, in the order its changes name them', () => {
  const px = { raw: '1px' };
  const changes = variant(style('gap', px, OTHER), style('gap', px), style('padding', px, OTHER));
  assert.deepEqual(variantIds(changes), [OTHER, ID]);
});
