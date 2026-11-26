// Apply on a live finding (ADR 0061): the plan a finding gets from the kit's tokens, the ops of
// that plan on the element's source view, the reasons there are none, and the words of Ask Claude.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_REQUEST_TEXT } from '../../../../../client/studio/edit/ai/requests.ts';
import {
  contrastToken,
  type FixPlan,
  familyOf,
  findingRequest,
  fixOps,
  isPlan,
  planFix,
  reasonKey,
  says,
  sizeChange,
  targetChanges,
} from '../../../../../client/studio/edit/live/fix.ts';
import { LIVE_RULE_IDS } from '../../../../../client/studio/edit/live/items.ts';
import { STYLE_PROPERTIES, type TokenOption } from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Plans:section/Stack/Button';
const ETAG = `"${'a'.repeat(27)}"`;
const SCSS_FILE = 'src/scss/sections/plans.scss';

const token = (
  path: string,
  name: string,
  type: TokenOption['type'],
  css: string,
): TokenOption => ({
  var: `--kit-${name}`,
  path,
  type,
  css,
});

const SIZE_ICON = token('size.icon', 'size-icon', 'dimension', '20px');
const SIZE_SM = token('size.controlSm', 'size-control-sm', 'dimension', '32px');
const SIZE = token('size.control', 'size-control', 'dimension', '40px');
const SPACE_XL = token('space.xl', 'space-xl', 'dimension', '24px');
const INK = token('color.ink', 'color-ink', 'color', '#1d2025');
const INK_MID = token('color.inkMid', 'color-ink-mid', 'color', '#6a707a');
const INK_SOFT = token('color.inkSoft', 'color-ink-soft', 'color', '#a4a9b2');
const FIX = token('color.fix', 'color-fix', 'color', '#b3331f');
const SURFACE = token('color.surface', 'color-surface', 'color', '#ffffff');
const VEIL = token('color.veil', 'color-veil', 'color', 'rgb(29 32 37 / 0.4)');

/** Base's tokens, as far as these rules read them; `space.xl` is 24 px but no size. */
const BASE = [SPACE_XL, SIZE_SM, SIZE_ICON, SIZE, INK, INK_MID, INK_SOFT, FIX, SURFACE, VEIL];

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
    file: 'src/tsx/sections/Plans.tsx',
    etag: ETAG,
    tag: 'a',
    component: null,
    props: [],
    spread: false,
    text: 'Compare plans',
    textRefusal: null,
    className: null,
    styleClass: { className: 'plans-link', exists: false },
    scss: { file: SCSS_FILE, etag: ETAG, rule: false, declarations: [], nested: [] },
    styles,
    ...overrides,
  };
}

/** An element whose class `plans-link` has a rule with `declarations`. */
const ruled = (declarations: Declarations, nested: string[] = []): Inspect =>
  inspected({
    className: { kind: 'string', value: 'plans-link' },
    styleClass: { className: 'plans-link', exists: true },
    scss: { file: SCSS_FILE, etag: ETAG, rule: true, declarations, nested },
  });

const target = (width: number, height: number) => ({
  rule: LIVE_RULE_IDS['target-size'],
  source: 'frame' as const,
  values: { width, height },
});

const contrast = (color: string, background = 'rgb(255, 255, 255)') => ({
  rule: LIVE_RULE_IDS.contrast,
  source: 'frame' as const,
  values: { ratio: 2.4, needed: 4.5, color, background },
});

function planOf(finding: Parameters<typeof planFix>[0], tokens = BASE): FixPlan {
  const plan = planFix(finding, tokens);
  assert.ok(isPlan(plan), 'a plan');
  return plan;
}

const options = { format: 'scss' as const, tokens: BASE, locked: false };

test('a target short on one side gets a minimum on that side only, from the size scale', () => {
  // The owner's link: 50.1 × 20.8 px. `size.icon` is too small and `space.xl` is no size.
  const plan = planOf(target(50.1, 20.8));
  assert.equal(plan.kind, 'target');
  assert.deepEqual(plan.changes, [
    {
      property: 'min-height',
      value: { token: '--kit-size-control-sm' },
      words: { token: 'size.controlSm', css: '32px' },
    },
  ]);
  const both = targetChanges({ width: 16, height: 16 }, BASE) ?? [];
  assert.deepEqual(
    both.map((change) => change.property),
    ['min-height', 'min-width'],
  );
});

test('without a size step that reaches 24 px the fix is the raw pixels', () => {
  assert.deepEqual(sizeChange([SPACE_XL, SIZE_ICON], 'height'), {
    property: 'min-height',
    value: { raw: '24px' },
    words: { raw: '24px' },
  });
  // Rounding that hides both sides still fixes the shorter one.
  assert.deepEqual(
    (targetChanges({ width: 30, height: 23.995 }, []) ?? []).map((change) => change.property),
    ['min-height'],
  );
});

test('the ops add the class once and make its rule once, so undo takes each away once', () => {
  const plan = planOf(target(16, 16));
  assert.deepEqual(fixOps(plan, inspected(), options), {
    ops: [
      { op: 'addClass', id: ID, className: 'plans-link' },
      {
        op: 'setStyle',
        id: ID,
        className: 'plans-link',
        property: 'min-height',
        value: { token: '--kit-size-control-sm' },
        before: null,
        newRule: true,
      },
      {
        op: 'setStyle',
        id: ID,
        className: 'plans-link',
        property: 'min-width',
        value: { token: '--kit-size-control-sm' },
        before: null,
        newRule: false,
      },
    ],
    everyItem: false,
  });
});

test('an element in a list gets the same ops, and the card says every item takes them', () => {
  const plan = planOf(target(50.1, 20.8));
  const list = { kind: 'literal', count: 3, reason: null } as NonNullable<Inspect['list']>;
  const one = fixOps(plan, ruled([]), options);
  const many = fixOps(plan, { ...ruled([]), list }, options);
  assert.ok('ops' in one && 'ops' in many);
  assert.deepEqual(many.ops, one.ops);
  assert.equal(one.everyItem, false);
  assert.equal(many.everyItem, true);
});

test('a source that cannot take the style gives its reason, and Apply does not show', () => {
  const plan = planOf(target(50.1, 20.8));
  const button = inspected({
    tag: 'Button',
    component: { name: 'Button', takesClassName: false, props: [] },
  });
  assert.deepEqual(fixOps(plan, button, options), { reason: 'no-classname' });
  assert.deepEqual(fixOps(plan, inspected(), { ...options, locked: true }), { reason: 'locked' });
  assert.deepEqual(fixOps(plan, ruled([], ['min-height']), options), { reason: 'nested' });
  assert.deepEqual(fixOps(plan, inspected({ scss: null }), options), { reason: 'not-found' });
  const held = ruled([
    { property: 'min-height', value: 'var(--kit-size-control-sm)', offKit: false },
  ]);
  assert.deepEqual(fixOps(plan, held, options), { reason: 'set' });
  assert.equal(reasonKey('set'), 'live.fix.set');
  assert.equal(reasonKey('nested'), 'props.reason.nested');
});

test('a value a shorthand holds is read as its part: the op carries it as before, the same value is set', () => {
  // `border: 1px solid #ddd` holds `border-color` (ADR 0070).
  const view = ruled([{ property: 'border', value: '1px solid #ddd', offKit: true }]);
  view.styles = {
    ...view.styles,
    'border-color': {
      kind: 'scss',
      className: 'plans-link',
      value: '#ddd',
      offKit: true,
      via: 'border',
    },
  };
  const change = (raw: string): FixPlan => ({
    kind: 'contrast',
    changes: [{ property: 'border-color', value: { raw }, words: { raw } }],
  });
  assert.deepEqual(fixOps(change('#999'), view, options), {
    ops: [
      {
        op: 'setStyle',
        id: ID,
        className: 'plans-link',
        property: 'border-color',
        value: { raw: '#999' },
        before: { raw: '#ddd' },
        newRule: false,
      },
    ],
    everyItem: false,
  });
  assert.deepEqual(fixOps(change('#ddd'), view, options), { reason: 'set' });
});

test('low contrast takes the nearest colour of its own family that reaches the ratio', () => {
  // `color.inkSoft` on white: `inkMid` reaches 4.5:1 and is nearer than `ink`; `fix` is no ink.
  const plan = planOf(contrast('rgb(164, 169, 178)'));
  assert.equal(plan.kind, 'contrast');
  assert.deepEqual(plan.changes[0]?.value, { token: '--kit-color-ink-mid' });
  assert.deepEqual(fixOps(plan, ruled([]), options), {
    ops: [
      {
        op: 'setStyle',
        id: ID,
        className: 'plans-link',
        property: 'color',
        value: { token: '--kit-color-ink-mid' },
        before: null,
        newRule: false,
      },
    ],
    everyItem: false,
  });
});

test('the family wins over a nearer colour of another; without one the nearest reaching wins', () => {
  const light = token('color.brand.300', 'color-brand-300', 'color', '#9db4ff');
  const dark = token('color.brand.900', 'color-brand-900', 'color', '#0a1a4d');
  const gray = token('color.gray.600', 'color-gray-600', 'color', '#6b6b6b');
  const tokens = [light, gray, dark];
  assert.equal(familyOf(dark), 'color.brand');
  assert.equal(familyOf(INK_MID), 'color.ink');
  const values = contrast('rgb(157, 180, 255)').values;
  assert.equal(contrastToken(values, tokens), dark);
  // A colour that is no token of the kit has no family: the nearest in lightness that reaches.
  assert.equal(contrastToken(contrast('rgb(150, 150, 150)').values, tokens), gray);
});

test('no colour of the kit reaching the ratio means no Apply', () => {
  const plan = planFix(contrast('rgb(164, 169, 178)'), [INK_SOFT, SURFACE, VEIL]);
  assert.deepEqual(plan, { none: 'no-token', needed: 4.5 });
  assert.equal(isPlan(plan), false);
});

test('a finding kitvas does not fix has no plan', () => {
  const overflow = { rule: LIVE_RULE_IDS.overflow, source: 'frame' as const, values: {} };
  assert.equal(planFix(overflow, BASE), null);
  assert.equal(planFix({ ...target(10, 10), source: 'code' }, BASE), null);
  assert.equal(planFix({ ...target(10, 10), values: null }, BASE), null);
  assert.equal(planFix(contrast('not a colour'), BASE), null);
});

test('the card says what Apply sets before the click', () => {
  const words = (key: string, params: Record<string, string | number> = {}): string =>
    [key, ...Object.entries(params).map(([name, value]) => `${name}=${value}`)].join(' ');
  assert.equal(
    says(planOf(target(50.1, 20.8)), words),
    'live.fix.setsOne property=min-height value=live.fix.token token=size.controlSm css=32px',
  );
  assert.equal(
    says(planOf(target(16, 16), []), words),
    'live.fix.setsTwo property=min-height value=24px property2=min-width value2=24px',
  );
});

test('Ask Claude files an ask request with the finding, its element and why, within the limit', () => {
  const request = findingRequest({
    element: ID,
    rule: LIVE_RULE_IDS.overflow,
    message: 'The content is 420 px wide in a 390 px box.',
    widths: [390],
    why: null,
  });
  assert.equal(request.kind, 'ask');
  assert.deepEqual(request.elements, [ID]);
  assert.deepEqual(request.context, { width: null, state: null, option: null });
  assert.match(request.text, /420 px wide/);
  assert.match(request.text, /390 px\./);
  assert.match(request.text, /live\/overflow/);
  const long = findingRequest({
    element: null,
    rule: LIVE_RULE_IDS.contrast,
    message: 'x'.repeat(5_000),
    widths: [],
    why: 'no-token',
  });
  assert.deepEqual(long.elements, []);
  assert.ok(long.text.length <= MAX_REQUEST_TEXT);
  assert.match(long.text, /no colour token/);
});
