// The ops of the plan 15 rows (task C): keywords at a covering prop or in the class rule, images
// of the version, and one gesture over several selected elements.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainValue } from '../../../client/studio/edit/props-kinds.ts';
import {
  allowedValue,
  heldText,
  opsForAll,
  opsForPropAll,
  opsForStyle,
  sharedProperties,
  sharedText,
} from '../../../client/studio/edit/props-ops.ts';
import { STYLE_PROPERTIES } from '../../../src/edit/index.ts';
import type { Inspect } from '../../../src/studio/api/edit-schemas.ts';

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
  assert.deepEqual(sharedProperties([plain], ['gap'], 'tailwind'), []);
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
