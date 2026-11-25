// The ops of the plan 15 rows (task C): keywords at a covering prop or in the class rule, images
// of the version, and one gesture over several selected elements.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainValue } from '../../../../../client/studio/edit/props/kinds.ts';
import {
  allowedValue,
  heldText,
  opsForAll,
  opsForPropAll,
  opsForStyle,
  readOnlyReason,
  sharedProperties,
  sharedText,
} from '../../../../../client/studio/edit/style/ops.ts';
import {
  STYLE_PROPERTIES,
  type StyleContext,
  type StyleValue,
  type TokenOption,
} from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const ID = 'sections/Pricing:section/Stack';
const ETAG = `"${'a'.repeat(27)}"`;
const SCSS_FILE = 'src/scss/sections/pricing.scss';

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
function ruled(id: string, name: string, declarations: Declarations): Inspect {
  return inspected({
    id,
    className: { kind: 'string', value: name },
    styleClass: { className: name, exists: true },
    scss: { file: SCSS_FILE, etag: ETAG, rule: true, declarations, nested: [] },
  });
}

/** A Base `Stack`: `direction`, `align`, `justify` and `wrap` cover the flex keywords. */
function stack(overrides: Partial<Inspect> = {}): Inspect {
  const base = inspected();
  return inspected({
    tag: 'Stack',
    component: {
      name: 'Stack',
      takesClassName: true,
      props: [
        { name: 'direction', type: 'enum', values: ['column', 'row'], default: 'column' },
        { name: 'align', type: 'enum', values: ['start', 'center', 'end', 'stretch'] },
        { name: 'justify', type: 'enum', values: ['start', 'center', 'end', 'between'] },
        { name: 'wrap', type: 'boolean', default: false },
      ],
    },
    styles: {
      ...base.styles,
      'flex-direction': { kind: 'prop', prop: 'direction' },
      'align-items': { kind: 'prop', prop: 'align' },
      'justify-content': { kind: 'prop', prop: 'justify' },
      'flex-wrap': { kind: 'prop', prop: 'wrap' },
    },
    ...overrides,
  });
}

const literal = (name: string, value: string): Inspect['props'][number] => ({
  name,
  kind: 'literal',
  value: { kind: 'string', value },
});

test("a keyword at a covering prop is written in the kit's word", () => {
  const view = stack({ props: [literal('direction', 'row')] });
  assert.deepEqual(opsForStyle(view, 'justify-content', plainValue('space-between')), [
    {
      op: 'setProp',
      id: ID,
      name: 'justify',
      value: { kind: 'string', value: 'between' },
      before: null,
      after: 'direction',
    },
  ]);
  assert.deepEqual(opsForStyle(view, 'flex-direction', plainValue('column')), [
    {
      op: 'setProp',
      id: ID,
      name: 'direction',
      value: { kind: 'string', value: 'column' },
      before: { kind: 'string', value: 'row' },
      after: null,
    },
  ]);
  const [wrap] = opsForStyle(view, 'flex-wrap', plainValue('wrap'));
  assert.deepEqual(wrap?.op === 'setProp' ? wrap.value : null, { kind: 'boolean', value: true });
  // Stack cannot say `baseline`, and a token is no keyword.
  assert.deepEqual(opsForStyle(view, 'align-items', plainValue('baseline')), []);
  assert.deepEqual(opsForStyle(view, 'align-items', { token: '--kit-space-md' }), []);
});

test('a keyword in the class rule is written plain, and only a word of its list', () => {
  const view = ruled(ID, 'plans', [{ property: 'display', value: 'grid', offKit: false }]);
  assert.deepEqual(opsForStyle(view, 'display', plainValue('flex')), [
    {
      op: 'setStyle',
      id: ID,
      className: 'plans',
      property: 'display',
      value: { raw: 'flex', mark: false },
      before: { raw: 'grid', mark: false },
      newRule: false,
    },
  ]);
  assert.deepEqual(opsForStyle(view, 'display', plainValue('contents')), []);
  assert.deepEqual(opsForStyle(view, 'display', { raw: 'flex' }), []);
  assert.deepEqual(opsForStyle(view, 'display', plainValue('grid')), []);
});

test("a word someone wrote outside the list is the change's before, as it is", () => {
  const view = ruled(ID, 'plans', [{ property: 'align-items', value: 'start', offKit: false }]);
  const [op] = opsForStyle(view, 'align-items', plainValue('center'));
  assert.deepEqual(op?.op === 'setStyle' ? op.before : null, { raw: 'start', mark: false });
});

test('a background image is only a file the version has, as url(../img/<file>)', () => {
  const view = inspected({ images: ['hero.png'] });
  const hero = plainValue('url(../img/hero.png)');
  assert.equal(allowedValue(view, 'background-image', hero), true);
  assert.equal(allowedValue(view, 'background-image', plainValue('url(../img/gone.png)')), false);
  assert.equal(allowedValue(view, 'background-image', { raw: 'url(../img/hero.png)' }), false);
  assert.equal(allowedValue(inspected(), 'background-image', hero), false);
  assert.equal(opsForStyle(view, 'background-image', hero).at(-1)?.op, 'setStyle');
  // Token properties take a raw value as in stage 4a.
  assert.equal(allowedValue(view, 'padding-top', { raw: '13px' }), true);
});

test('elements of one class rule get its declaration once in a gesture', () => {
  const a = ruled(`${ID}/a`, 'card', []);
  const b = ruled(`${ID}/b`, 'card', []);
  const c = ruled(`${ID}/c`, 'note', []);
  const ops = opsForAll([a, b, c], 'padding-top', { token: '--kit-space-md' });
  assert.deepEqual(
    ops.map((op) => [op.op, op.op === 'setStyle' ? op.className : null]),
    [
      ['setStyle', 'card'],
      ['setStyle', 'note'],
    ],
  );
  // Two elements without a class: each gets the class, and the new rule is made once.
  const x = inspected({ id: `${ID}/x`, styleClass: { className: 'plans', exists: false } });
  const y = inspected({ id: `${ID}/y`, styleClass: { className: 'plans', exists: false } });
  const made = opsForAll([x, y], 'gap', { token: '--kit-space-md' });
  assert.deepEqual(
    made.map((op) => [op.op, 'id' in op ? op.id : null]),
    [
      ['addClass', `${ID}/x`],
      ['setStyle', `${ID}/x`],
      ['addClass', `${ID}/y`],
    ],
  );
});

test('a prop on several elements is one op each, and a same value none', () => {
  const one = stack({ id: `${ID}/1`, props: [literal('justify', 'start')] });
  const two = stack({ id: `${ID}/2`, props: [literal('justify', 'center')] });
  const ops = opsForPropAll([one, two], 'justify', { kind: 'string', value: 'center' });
  assert.deepEqual(
    ops.map((op) => ('id' in op ? op.id : null)),
    [`${ID}/1`],
  );
});

test('several elements share the rows none of them has read-only', () => {
  const plain = ruled(`${ID}/a`, 'card', []);
  const icon = inspected({
    id: `${ID}/i`,
    tag: 'Icon',
    component: { name: 'Icon', takesClassName: false, props: [] },
  });
  assert.deepEqual(sharedProperties([plain, icon], ['gap', 'display'], 'scss'), []);
  assert.deepEqual(sharedProperties([plain, stack()], ['gap', 'display'], 'scss'), [
    'gap',
    'display',
  ]);
  // A Tailwind draft's rows are written as utility classes since stage 4c.
  assert.deepEqual(sharedProperties([plain], ['gap'], 'tailwind'), ['gap']);
  assert.deepEqual(sharedProperties([plain, icon], ['gap'], 'tailwind'), []);
});

// ---- A width or a state (spec 4c, goal 2) -------------------------------------------------------

const AT_768: StyleContext = { width: 768, state: null };
const HOVER_768: StyleContext = { width: 768, state: 'hover' };
const MD: StyleValue = { token: '--kit-space-md' };

type Override = NonNullable<Inspect['overrides']>[number];

const override = (
  context: StyleContext,
  property: Override['property'],
  value: string,
  utility: string | null = null,
): Override => ({ context, property, value, offKit: !value.startsWith('var('), utility });

test('a new value of a width may make its block, a changed one goes where it is', () => {
  const view = ruled(ID, 'plans', [{ property: 'gap', value: '1px', offKit: true }]);
  const at = { id: ID, className: 'plans', property: 'gap', context: AT_768 };
  assert.deepEqual(opsForStyle(view, 'gap', MD, { context: AT_768 }), [
    { op: 'setStyle', ...at, value: MD, before: null, newRule: false, newBlock: true },
  ]);
  // Another property is there already, maybe in an earlier rule of the class: the server makes the
  // block in the last rule when it has none, and only adds when it has one.
  const padded = { ...view, overrides: [override(AT_768, 'padding', '2px')] };
  assert.deepEqual(opsForStyle(padded, 'gap', MD, { context: AT_768 }), [
    { op: 'setStyle', ...at, value: MD, before: null, newRule: false, newBlock: true },
  ]);
  // The hover block of the same width is another block.
  const [hover] = opsForStyle(padded, 'gap', MD, { context: HOVER_768 });
  assert.equal(hover?.op === 'setStyle' ? hover.newBlock : null, true);
  // The value it holds is the change's before, and the same value is no change.
  const held = { ...view, overrides: [override(AT_768, 'gap', '2px')] };
  assert.deepEqual(opsForStyle(held, 'gap', MD, { context: AT_768 }), [
    { op: 'setStyle', ...at, value: MD, before: { raw: '2px' }, newRule: false, newBlock: false },
  ]);
  assert.deepEqual(opsForStyle(held, 'gap', { raw: '2px' }, { context: AT_768 }), []);
});

test('a removed value of a width takes its block along, and never the rule', () => {
  const view = {
    ...ruled(ID, 'plans', []),
    overrides: [override(AT_768, 'gap', 'var(--kit-space-md)')],
  };
  assert.deepEqual(opsForStyle(view, 'gap', null, { context: AT_768 }), [
    {
      op: 'removeStyle',
      id: ID,
      className: 'plans',
      property: 'gap',
      context: AT_768,
      before: MD,
      dropRule: false,
      dropBlock: true,
    },
  ]);
  // Nothing is set there, and the base value is not this context's to remove.
  assert.deepEqual(opsForStyle(view, 'gap', null, { context: HOVER_768 }), []);
  assert.deepEqual(opsForStyle(view, 'padding', null, { context: AT_768 }), []);
});

test('an element without a class gets the class, the rule and the block in one gesture', () => {
  const ops = opsForStyle(inspected(), 'gap', MD, { context: HOVER_768 });
  assert.deepEqual(ops, [
    { op: 'addClass', id: ID, className: 'plans' },
    {
      op: 'setStyle',
      id: ID,
      className: 'plans',
      property: 'gap',
      context: HOVER_768,
      value: MD,
      before: null,
      newRule: true,
      newBlock: true,
    },
  ]);
});

test('the base context gives the ops of stage 4a', () => {
  const view = ruled(ID, 'plans', []);
  const base = { width: null, state: null };
  assert.deepEqual(opsForStyle(view, 'gap', MD, { context: base }), opsForStyle(view, 'gap', MD));
  assert.equal('context' in (opsForStyle(view, 'gap', MD, { context: base })[0] ?? {}), false);
});

test('a property a prop covers is read-only at a width or in a state', () => {
  const view = stack();
  assert.equal(readOnlyReason(view, 'flex-direction', 'scss'), null);
  assert.equal(readOnlyReason(view, 'flex-direction', 'scss', AT_768), 'prop-covered');
  assert.equal(readOnlyReason(view, 'flex-direction', 'tailwind', HOVER_768), 'prop-covered');
  assert.deepEqual(opsForStyle(view, 'flex-direction', plainValue('row'), { context: AT_768 }), []);
  // A property no prop covers is written beside the component's class.
  assert.equal(readOnlyReason(view, 'padding', 'scss', AT_768), null);
  // A block kitvas does not read stops the base only; the server checks a context's own.
  const nested = ruled(ID, 'plans', []);
  const blocked = { ...nested, scss: nested.scss && { ...nested.scss, nested: ['gap'] } };
  assert.equal(readOnlyReason(blocked, 'gap', 'scss'), 'nested');
  assert.equal(readOnlyReason(blocked, 'gap', 'scss', AT_768), null);
});

// ---- Tailwind -----------------------------------------------------------------------------------

const TOKENS: TokenOption[] = [
  { var: '--kit-space-md', path: 'space.md', type: 'dimension', css: '12px' },
  { var: '--kit-color-primary', path: 'color.primary', type: 'color', css: '#18181b' },
];
const TAILWIND = { format: 'tailwind' as const, tokens: TOKENS };

const classed = (classes: string): Inspect =>
  inspected({ className: { kind: 'string', value: classes } });

test('a Tailwind draft takes a style as one utility class, under the context prefixes', () => {
  const view = classed('flex');
  assert.deepEqual(opsForStyle(view, 'gap', MD, TAILWIND), [
    { op: 'setUtility', id: ID, value: 'gap-md', before: null },
  ]);
  assert.deepEqual(opsForStyle(view, 'gap', { raw: '13px' }, { ...TAILWIND, context: AT_768 }), [
    { op: 'setUtility', id: ID, value: 'md:gap-[13px]', before: null },
  ]);
  const hover = { ...TAILWIND, context: HOVER_768 };
  assert.deepEqual(opsForStyle(view, 'background-color', { token: '--kit-color-primary' }, hover), [
    { op: 'setUtility', id: ID, value: 'md:hover:bg-primary', before: null },
  ]);
  assert.deepEqual(opsForStyle(view, 'display', plainValue('none'), hover), [
    { op: 'setUtility', id: ID, value: 'md:hover:hidden', before: null },
  ]);
  // A token the client cannot name, and an image, give no class.
  assert.deepEqual(opsForStyle(view, 'gap', MD, { format: 'tailwind' }), []);
  assert.equal(readOnlyReason(view, 'background-image', 'tailwind'), 'utility-unknown');
});

test("a property's own utility is swapped, another one stays and a class is added", () => {
  const base = classed('p-4');
  const view: Inspect = {
    ...base,
    styles: {
      ...base.styles,
      padding: { kind: 'utility', className: 'p-4' },
      'padding-top': { kind: 'utility', className: 'p-4' },
    },
    overrides: [override(AT_768, 'padding', '6', 'md:p-6')],
  };
  assert.deepEqual(opsForStyle(view, 'padding', { raw: '8px' }, TAILWIND), [
    { op: 'setUtility', id: ID, value: 'p-[8px]', before: 'p-4' },
  ]);
  assert.deepEqual(opsForStyle(view, 'padding', null, TAILWIND), [
    { op: 'setUtility', id: ID, value: null, before: 'p-4' },
  ]);
  // `p-4` sets every side: the top's row adds its own class and cannot take `p-4` away.
  assert.deepEqual(opsForStyle(view, 'padding-top', { raw: '8px' }, TAILWIND), [
    { op: 'setUtility', id: ID, value: 'pt-[8px]', before: null },
  ]);
  assert.deepEqual(opsForStyle(view, 'padding-top', null, TAILWIND), []);
  // At 768 the override's class is the one swapped or removed.
  const wide = { ...TAILWIND, context: AT_768 };
  assert.deepEqual(opsForStyle(view, 'padding', MD, wide), [
    { op: 'setUtility', id: ID, value: 'md:p-md', before: 'md:p-6' },
  ]);
  assert.deepEqual(opsForStyle(view, 'padding', null, wide), [
    { op: 'setUtility', id: ID, value: null, before: 'md:p-6' },
  ]);
  assert.deepEqual(opsForStyle(view, 'padding', null, { ...TAILWIND, context: HOVER_768 }), []);
});

test('a className built in code and a component without one stay read-only in Tailwind', () => {
  const computed = inspected({ className: { kind: 'expr', source: 'cn("flex", wide)' } });
  assert.equal(readOnlyReason(computed, 'gap', 'tailwind'), 'computed');
  assert.deepEqual(opsForStyle(computed, 'gap', MD, TAILWIND), []);
  const icon = inspected({ component: { name: 'Icon', takesClassName: false, props: [] } });
  assert.equal(readOnlyReason(icon, 'gap', 'tailwind', AT_768), 'no-classname');
});

test('the text a row shows for several elements, or mixed', () => {
  const a = ruled(`${ID}/a`, 'a', [{ property: 'display', value: 'flex', offKit: false }]);
  const b = ruled(`${ID}/b`, 'b', [{ property: 'display', value: 'flex', offKit: false }]);
  const c = ruled(`${ID}/c`, 'c', [{ property: 'display', value: 'grid', offKit: false }]);
  assert.deepEqual(sharedText([a, b], 'display'), { text: 'flex' });
  assert.equal(sharedText([a, c], 'display'), 'mixed');
  assert.deepEqual(sharedText([a, b], 'gap'), { text: null });
  // A covering prop's value is the text of the row.
  const row = stack({ props: [literal('direction', 'row')] });
  assert.equal(heldText(row, 'flex-direction'), 'row');
  assert.equal(heldText(stack(), 'flex-direction'), null);
});
