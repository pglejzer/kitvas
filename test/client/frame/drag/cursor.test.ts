import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cursorCss } from '../../../../client/frame/drag/gesture/cursor.ts';

test('the cursor of a drag is one rule over the whole page, above the page own cursors', () => {
  assert.equal(cursorCss('grabbing'), 'html,html *{cursor:grabbing!important}');
  assert.equal(cursorCss('not-allowed'), 'html,html *{cursor:not-allowed!important}');
});

test('with no drag the rule is empty: the page has its own cursors back', () => {
  assert.equal(cursorCss(null), '');
});
