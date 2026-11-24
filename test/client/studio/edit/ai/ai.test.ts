// The AI tab's small rules (spec 4d, goal 2; plan 17, task B): how a request names its elements,
// which elements Ask again keeps, and when a variant can be tried.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../../../../../client/channel/edit-protocol.ts';
import { blockedOf, namesOf, presenceOf } from '../../../../../client/studio/edit/ai/ai.ts';

const ID = 'sections/Hero:section/Stack/Button';
const OTHER = 'sections/Hero:section/Stack/Text';
const LONG = 'sections/Hero:section/Stack/Card';

const node = (id: string, name: string): TreeNode => ({ id, parent: null, name, count: 1 });

test('an element is named by its layer, else by the parts of its id', () => {
  const nameOf = namesOf([node(ID, ' Buy now '), node(LONG, 'x'.repeat(60))]);
  assert.equal(nameOf(ID), 'Buy now');
  assert.equal(nameOf(OTHER), 'Hero / Text');
  assert.equal(nameOf(LONG).length, 40);
  assert.ok(nameOf(LONG).endsWith('…'));
});

test('Ask again keeps the elements in the tree; every one while the tree is not read', () => {
  assert.equal(presenceOf([])(ID), true);
  const present = presenceOf([node(ID, 'Buy')]);
  assert.equal(present(ID), true);
  assert.equal(present(OTHER), false);
});

test('a variant is tried in Edit only, and never while an older version is shown', () => {
  assert.equal(blockedOf({ on: true, viewing: null }), null);
  assert.equal(blockedOf({ on: false, viewing: null }), 'ai.blocked.edit');
  assert.equal(blockedOf({ on: true, viewing: 1 }), 'ai.blocked.viewing');
});
