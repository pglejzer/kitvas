import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKIN_EDITOR_LAYERS } from '../../../../src/studio/pages/skin/editor/left/layers.ts';

const ruleOf = (selector: string): string => {
  const start = SKIN_EDITOR_LAYERS.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `${selector} is defined`);
  return SKIN_EDITOR_LAYERS.slice(start, SKIN_EDITOR_LAYERS.indexOf('}', start));
};

test('in a narrow pane a layer name gives way to the lock and the eye, which never draw over it', () => {
  // The name shrinks to what is left and ends in an ellipsis; a minimum width would push it
  // under the two buttons of a deep row.
  assert.match(ruleOf('.layers-name'), /min-width: 0;/);
  // What cannot shrink (the kit mark, a badge) is cut at the row's edge, not drawn past it.
  assert.match(ruleOf('.layers-row'), /overflow: hidden;/);
});

test('the lock and the eye show on hover, when on and for the keyboard, not after a click', () => {
  const shown =
    /\n([^\n{]*\n?[^\n{]*) \{ display: inline-grid; \}/.exec(SKIN_EDITOR_LAYERS)?.[1] ?? '';
  assert.ok(shown.includes('.layers-line:hover > .k-icon-btn'));
  assert.ok(shown.includes('.layers-line:has(:focus-visible) > .k-icon-btn'));
  assert.ok(shown.includes('.layers-line > .k-icon-btn[aria-pressed="true"]'));
  // A click leaves the focus on the row: with `:focus-within` the selected row's name would stay
  // cut by the two buttons after the pointer left.
  assert.ok(!SKIN_EDITOR_LAYERS.includes(':focus-within'));
});
