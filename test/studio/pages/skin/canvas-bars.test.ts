import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKIN_EDITOR_LENS } from '../../../../src/studio/pages/skin/editor/canvas/lens.ts';
import { SKIN_EDITOR_OPTIONS } from '../../../../src/studio/pages/skin/editor/canvas/options.ts';
import { SKIN_EDITOR_STAGE } from '../../../../src/studio/pages/skin/editor/canvas/stage.ts';

/** The layer (`z-index`) a skin gives a bar of the canvas in the bar's own rule. */
const layerOf = (skin: string, selector: string): number => {
  const start = skin.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `${selector} is defined`);
  const found = /z-index: (\d+);/.exec(skin.slice(start, skin.indexOf('}', start)));
  assert.ok(found, `${selector} has a layer`);
  return Number(found[1]);
};

test('the options row lies under the pills, so a menu that a pill opens is never drawn under it', () => {
  // A pill bar is a stacking context: the layer of its menu counts only inside the bar. On the
  // bar's own layer the row, which comes later in the page, drew over the state's menu.
  const row = layerOf(SKIN_EDITOR_OPTIONS, '.opt-row');
  assert.ok(row < layerOf(SKIN_EDITOR_STAGE, '.pill-row'), 'under the state, the width and More');
  assert.ok(row < layerOf(SKIN_EDITOR_LENS, '.pill-lens'), 'under the lens pill and its menu');
});
