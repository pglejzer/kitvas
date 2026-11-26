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

test('the bottom row holds the ask bar, then the zoom pill, which the script fills', () => {
  const text = canvasTools(t).text;
  const zoom = `<div class="k-pop k-pill pill-zoom" data-dock="zoom" role="group" aria-label="${escapeHtml(t('studio.edit.zoom.label'))}"></div>`;
  assert.equal(count(text, 'data-dock="zoom"'), 1);
  const foot = /<div class="stage-foot">(.*?)<\/div><div class="sel-tools"/.exec(text)?.[1] ?? '';
  assert.ok(foot.startsWith('<form class="k-pop ask-bar"'));
  assert.ok(foot.endsWith(zoom));
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

test('the bottom row is a grid with the ask bar in the middle and the zoom pill last, with no script and no translate', () => {
  assert.match(
    EDITOR_PARTS.stage,
    /\.stage-foot \{[^}]*grid-template-columns: 1fr minmax\(0, 470px\) 1fr;/,
  );
  assert.match(EDITOR_PARTS.stage, /\.pill-zoom \{ grid-column: 3; [^}]*margin-left: /);
  assert.doesNotMatch(EDITOR_PARTS.ask, /translate:/);
  assert.match(EDITOR_PARTS.ask, /\.ask-bar \{\n {2}grid-column: 2;/);
});
