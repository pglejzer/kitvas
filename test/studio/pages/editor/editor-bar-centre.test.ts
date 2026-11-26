import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKIN_EDITOR_BAR } from '../../../../src/studio/pages/skin/editor/shell/bar.ts';
import { SKIN_SURFACES } from '../../../../src/studio/pages/skin/surfaces.ts';

test('the editor bar has two equal side columns, so the mode switch stays in the middle', () => {
  assert.ok(SKIN_EDITOR_BAR.includes('grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);'));
  assert.ok(!SKIN_EDITOR_BAR.includes('min-content'));
});

test('the shared bar of every other page uses the same equal side columns', () => {
  assert.ok(SKIN_SURFACES.includes('grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);'));
});

test('the editor bar takes no colour or size that is not a studio token', () => {
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(SKIN_EDITOR_BAR));
});
