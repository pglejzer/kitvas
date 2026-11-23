import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  elementName,
  entryParts,
  mapToNearestOp,
  newestFirst,
  type OffKitItem,
  sectionOfFile,
} from '../../../client/studio/edit/changes.ts';
import type { ChangeEntry } from '../../../client/studio/edit/store.ts';

const entry = (patch: Partial<ChangeEntry>): ChangeEntry => ({
  by: 'person',
  id: null,
  label: 'Set gap',
  files: [],
  offKit: false,
  at: 1,
  ...patch,
});

const item: OffKitItem = {
  file: 'src/scss/sections/order-summary.scss',
  className: 'total',
  property: 'margin',
  value: '13px',
  nearest: { var: '--kit-space-md', path: 'space.md', type: 'dimension', css: '12px' },
};

test('an element name shows the section file and the last tag of the id', () => {
  assert.equal(elementName('sections/Pricing:section/Stack/Card.2'), 'Pricing / Card.2');
  assert.equal(elementName('Pricing:section'), 'Pricing / section');
  assert.equal(elementName('plain'), 'plain');
});

test('a change of the person names the element and carries its id', () => {
  const parts = entryParts(entry({ id: 'sections/Hero:section/Stack', offKit: true }));
  assert.deepEqual(parts, {
    who: 'person',
    element: 'Hero / Stack',
    label: 'Set gap',
    offKit: true,
    id: 'sections/Hero:section/Stack',
  });
});

test('a change by Claude without an element lists its files and selects nothing', () => {
  const parts = entryParts(
    entry({ by: 'claude', files: ['src/tsx/sections/Hero.tsx', 'src/scss/sections/hero.scss'] }),
  );
  assert.equal(parts.who, 'claude');
  assert.equal(parts.element, 'src/tsx/sections/Hero.tsx, src/scss/sections/hero.scss');
  assert.equal(parts.id, null);
});

test('the list is newest first, and entries of one instant keep the later one first', () => {
  const list = [
    entry({ label: 'a', at: 1 }),
    entry({ label: 'b', at: 3 }),
    entry({ label: 'c', at: 3 }),
    entry({ label: 'd', at: 2 }),
  ];
  assert.deepEqual(
    newestFirst(list).map((each) => each.label),
    ['c', 'b', 'd', 'a'],
  );
  assert.equal(list[0]?.label, 'a');
});

test('a section is read from its file name, with or without the partial underscore', () => {
  assert.equal(sectionOfFile('src/scss/sections/hero.scss'), 'hero');
  assert.equal(sectionOfFile('src/scss/sections/_order-summary.scss'), 'order-summary');
  assert.equal(sectionOfFile('src/scss/index.scss'), null);
  assert.equal(sectionOfFile('src/tsx/sections/Hero.tsx'), null);
});

test('map to nearest is one setStyle from the raw value to the token, on an existing rule', () => {
  assert.deepEqual(mapToNearestOp(item), {
    op: 'setStyle',
    id: 'sections/OrderSummary:section',
    className: 'total',
    property: 'margin',
    value: { token: '--kit-space-md' },
    before: { raw: '13px' },
    newRule: false,
  });
});

test('map to nearest is offered only with a nearest token and a section file', () => {
  assert.equal(mapToNearestOp({ ...item, nearest: null }), null);
  assert.equal(mapToNearestOp({ ...item, file: 'src/scss/index.scss' }), null);
});
