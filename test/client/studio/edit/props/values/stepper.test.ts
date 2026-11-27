// The kit's own control of a token row (plan 18f, task 2; spec S4.6 item 5; Review Focus 4): a
// stepper over the property's scale, swatches for a colour, and today's typed field where the kit
// has no tokens of the type or too many to label. A pick writes what any other pick writes, so a
// Tailwind draft still gets its utility class.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_STOPS,
  stepperOf,
  stopLabel,
  styleLook,
  tokenNameOf,
} from '../../../../../../client/studio/edit/props/values/stepper.ts';
import { opsForAll } from '../../../../../../client/studio/edit/style/ops.ts';
import { STYLE_PROPERTIES, type TokenOption } from '../../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Pricing:section/Stack';
const ETAG = `"${'a'.repeat(27)}"`;

const dimension = (path: string, css: string): TokenOption => ({
  var: `--kit-${path.replace('.', '-')}`,
  path,
  type: 'dimension',
  css,
});

/** A kit's radii, out of order: the scale is ordered by value. */
const RADII: TokenOption[] = [
  dimension('radius.lg', '14px'),
  dimension('radius.full', '9999px'),
  dimension('radius.sm', '6px'),
  dimension('radius.md', '10px'),
];
const SPACE: TokenOption[] = [
  dimension('space.sm', '8px'),
  dimension('space.md', '12px'),
  dimension('space.lg', '16px'),
];
const COLOURS: TokenOption[] = [
  { var: '--kit-color-ink', path: 'color.ink', type: 'color', css: '#18181b' },
  { var: '--kit-color-paper', path: 'color.paper', type: 'color', css: '#ffffff' },
];
const KIT = [...RADII, ...SPACE, ...COLOURS];

test("a radius steps over the kit's radii, each stop its name and its px", () => {
  assert.equal(styleLook('border-radius', KIT), 'stepper');
  const { stops } = stepperOf(KIT, 'border-radius', null, null);
  const labels = stops.map((stop) => stop.label);
  assert.deepEqual(labels, ['sm · 6', 'md · 10', 'lg · 14', 'full']);
  const names = stops.map((stop) => stop.name);
  assert.deepEqual(names, ['sm', 'md', 'lg', 'full']);
  assert.equal(stops[1]?.var, '--kit-radius-md');
  assert.equal(tokenNameOf({ path: 'radius.md' }), 'md');
  assert.equal(stopLabel({ path: 'size.half', css: '50%' }), 'half · 50%');
});

test('the stop the source names is checked; with none, the computed one is marked', () => {
  assert.equal(stepperOf(KIT, 'border-radius', 'var(--kit-radius-md)', '10px').at, 1);
  assert.equal(stepperOf(KIT, 'border-radius', 'var(--kit-radius-md)', '10px').hint, -1);
  const computed = stepperOf(KIT, 'border-radius', null, '14px');
  assert.deepEqual([computed.at, computed.hint], [-1, 2]);
  // A raw value equal to a token's is still off the kit: no stop is checked.
  const raw = stepperOf(KIT, 'border-radius', '10px', '10px');
  assert.deepEqual([raw.at, raw.hint], [-1, -1]);
  // Another token than the scale's is no stop either.
  assert.equal(stepperOf(KIT, 'border-radius', 'var(--kit-space-md)', '12px').at, -1);
});

test("a kit with no tokens of the type, or of the property's group, keeps the typed field", () => {
  assert.equal(styleLook('border-radius', []), 'field');
  // Spacing tokens are dimensions too, but a radius never steps over them.
  assert.equal(styleLook('border-radius', SPACE), 'field');
  assert.equal(styleLook('width', KIT), 'field');
  assert.equal(styleLook('color', []), 'field');
  assert.equal(styleLook('color', SPACE), 'field');
  // One radius is no scale to step along.
  assert.equal(styleLook('border-radius', [dimension('radius.md', '10px')]), 'field');
});

test('a colour is the kit swatches; spacing and a scale too long to label stay a field', () => {
  assert.equal(styleLook('background-color', KIT), 'swatches');
  assert.equal(styleLook('color', COLOURS), 'swatches');
  assert.equal(styleLook('padding', KIT), 'field');
  assert.equal(styleLook('gap', KIT), 'field');
  const long = Array.from({ length: MAX_STOPS + 1 }, (_, index) =>
    dimension(`radius.r${index}`, `${index * 2}px`),
  );
  assert.equal(styleLook('border-radius', long), 'field');
  assert.equal(styleLook('border-radius', long.slice(0, MAX_STOPS)), 'stepper');
});

/** A Tailwind element: the class names are its styles; every property is the kit's. */
function classed(classes: string): Inspect {
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
    className: { kind: 'string', value: classes },
    styleClass: { className: 'plans', exists: false },
    scss: {
      file: 'src/scss/sections/pricing.scss',
      etag: ETAG,
      rule: false,
      declarations: [],
      nested: [],
    },
    styles,
  };
}

test('a stop picked in a Tailwind draft still writes the utility class', () => {
  const stop = stepperOf(KIT, 'border-radius', null, null).stops[1];
  assert.ok(stop);
  // A Tailwind 4 kit maps each token onto its theme variable (`--radius-md`, `--color-ink`).
  const tokens = KIT.map((token): TokenOption => {
    const [group = '', name = ''] = token.path.split('.');
    return { ...token, utility: { namespace: group === 'space' ? 'spacing' : group, name } };
  });
  const tailwind = { format: 'tailwind' as const, tokens };
  const view = classed('flex');
  const radius = opsForAll([view], 'border-radius', { token: stop.var }, tailwind);
  assert.deepEqual(radius, [{ op: 'setUtility', id: ID, value: 'rounded-md', before: null }]);
  // A swatch writes the colour's token the same way.
  const swatch = COLOURS[0];
  assert.ok(swatch);
  const colour = opsForAll([view], 'background-color', { token: swatch.var }, tailwind);
  assert.deepEqual(colour, [{ op: 'setUtility', id: ID, value: 'bg-ink', before: null }]);
});
