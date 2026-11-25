import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectPath, modeOf, modePatch } from '../../../../../client/studio/edit/select/mode.ts';

const ROW = 'sections/Plans:section/Card/ul/li';
const TITLE = 'sections/Plans:section/h2';

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

test('the source view is read for the one chosen copy, by its path', () => {
  const copy = { id: ROW, item: 4, path: [1, 1] };
  assert.deepEqual(inspectPath({ selection: [ROW], copies: [copy] }), [1, 1]);
  // The element itself, a copy the frame gave no path, several copies or several elements: the
  // element is read as it is written, for no one copy.
  assert.equal(inspectPath({ selection: [ROW], copies: [] }), undefined);
  assert.equal(inspectPath({ selection: [ROW], copies: [{ id: ROW, item: 4 }] }), undefined);
  const two = [copy, { id: ROW, item: 5, path: [1, 2] }];
  assert.equal(inspectPath({ selection: [ROW], copies: two }), undefined);
  assert.equal(inspectPath({ selection: [ROW, TITLE], copies: [copy] }), undefined);
  assert.equal(inspectPath({ selection: [], copies: [] }), undefined);
});
