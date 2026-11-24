import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modeOf, modePatch } from '../../../client/studio/edit/mode.ts';

test('Edit turns the editor on, and pressing the mode it is in does nothing', () => {
  assert.deepEqual(modePatch(false, 'edit'), { on: true });
  assert.equal(modePatch(true, 'edit'), null);
  assert.equal(modePatch(false, 'preview'), null);
});

test('Preview turns the editor off and drops the selection, the hover and the element read', () => {
  assert.deepEqual(modePatch(true, 'preview'), {
    on: false,
    selection: [],
    hovered: null,
    inspected: null,
    computed: null,
  });
});

test('the screen reads edit while the editor is on, else preview', () => {
  assert.equal(modeOf(true), 'edit');
  assert.equal(modeOf(false), 'preview');
});
