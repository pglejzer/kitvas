// The hosts of the tools on the canvas (plan 19, task 0): the page draws them empty and the page
// script fills them, so nothing moves when it does.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasTools } from '../../../../src/studio/pages/draft/draft-stage.ts';
import { escapeHtml } from '../../../../src/studio/pages/html.ts';
import { EDITOR_PARTS } from '../../../../src/studio/pages/skin/editor/index.ts';
import { t } from '../../../helpers/translate.ts';

const count = (text: string, part: string): number => text.split(part).length - 1;

test('one host each for the lens pill, the ask bar and the tools on the selection, all empty', () => {
  const text = canvasTools(t).text;
  assert.equal(count(text, 'data-lens-pill'), 1);
  assert.equal(count(text, 'data-ask-bar'), 1);
  assert.equal(count(text, 'data-sel-tools'), 1);
  assert.ok(
    text.includes(
      `<div class="k-pop k-pill pill-lens" data-lens-pill role="toolbar" aria-label="${escapeHtml(t('studio.edit.lens.label'))}"></div>`,
    ),
  );
  assert.ok(text.includes('></form>'));
  assert.ok(text.endsWith('></div>'));
});

test('the ask bar is hidden until the script shows it in Edit', () => {
  const text = canvasTools(t).text;
  assert.match(text, /<form class="k-pop ask-bar" data-ask-bar aria-label="[^"]+" hidden><\/form>/);
});

test('each host has its skin file, and an empty host takes no room', () => {
  assert.match(EDITOR_PARTS.lens, /\.pill-lens:empty \{ display: none; \}/);
  assert.match(EDITOR_PARTS.ask, /\.ask-bar\[hidden\] \{ display: none; \}/);
  assert.match(EDITOR_PARTS.seltools, /\.sel-tools:empty \{ display: none; \}/);
});
