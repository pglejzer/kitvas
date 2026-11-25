import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../../../../../client/channel/edit-protocol.ts';
import { layerName, sectionLabel } from '../../../../../client/studio/edit/layers/names.ts';

const node = (over: Partial<TreeNode> = {}): TreeNode => ({
  id: 'sections/Plans:section/p',
  parent: null,
  name: 'Pick the plan',
  count: 1,
  cls: null,
  ...over,
});

test('a kit component is named by the component', () => {
  assert.equal(layerName({ component: 'Button', tag: 'Button' }, node()), 'Button');
});

test("the draft's own component is named by its tag", () => {
  assert.equal(layerName({ component: null, tag: 'PlanCard' }, node()), 'PlanCard');
});

test('a plain element is named by its first class', () => {
  assert.equal(layerName({ component: null, tag: 'p' }, node({ cls: 'plans__price' })), 'Price');
  assert.equal(layerName({ component: null, tag: 'div' }, node({ cls: 'plan-card' })), 'Plan card');
  assert.equal(layerName({ component: null, tag: 'div' }, node({ cls: 'plans__row--big' })), 'Row');
});

test('a plain element with no class is named by its tag', () => {
  assert.equal(layerName({ component: null, tag: 'div' }, node()), 'div');
  assert.equal(layerName({ component: null, tag: 'svg' }, node()), 'svg');
  assert.equal(layerName({ component: null, tag: 'span' }, node({ cls: '' })), 'span');
});

test('the text is never the name', () => {
  const name = layerName({ component: null, tag: 'h1' }, node({ name: 'Pick the plan' }));
  assert.equal(name, 'h1');
  assert.notEqual(name, 'Pick the plan');
});

test('a row the structure does not list is named from its class, else the end of its id', () => {
  assert.equal(layerName(undefined, node({ cls: 'faq-list' })), 'Faq list');
  assert.equal(layerName(undefined, node({ id: 'sections/Faq:section/ul' })), 'ul');
  assert.equal(layerName(undefined, node({ id: 'sections/Faq:section' })), 'section');
  assert.notEqual(layerName(undefined, node({ id: '' })), '');
});

test('a section label is in sentence case', () => {
  assert.equal(sectionLabel('plans'), 'Plans');
  assert.equal(sectionLabel('faq-list'), 'Faq list');
  assert.equal(sectionLabel('OrderSummary'), 'Order summary');
});
