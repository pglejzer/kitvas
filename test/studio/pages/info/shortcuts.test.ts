import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml } from '../../../../src/studio/pages/html.ts';
import { SHORTCUT_GROUPS, SHORTCUT_ROWS } from '../../../../src/studio/views/shortcuts.ts';
import { t } from '../../../helpers/translate.ts';
import { count, infoPage, mainOf } from './info-helpers.ts';

/** The markup of the row with this id. */
function rowOf(text: string, id: string): string {
  const row = new RegExp(`<li class="info-key" data-shortcut="${id}">[\\s\\S]*?</li>`).exec(text);
  assert.ok(row, id);
  return row[0];
}

test('one card per group, titled as the editor titles it', async () => {
  const main = mainOf(await infoPage('shortcuts'));
  assert.equal(count(main, '<h1'), 1);
  assert.equal(count(main, 'class="info-card info-card-pad"'), SHORTCUT_GROUPS.length);
  for (const group of SHORTCUT_GROUPS) {
    const title = escapeHtml(t(`studio.edit.shortcuts.group.${group}`));
    assert.ok(main.includes(`data-group="${group}"><h2>${title}</h2>`), group);
  }
});

test('the block has the back link and the hint with a key cap; the foot marks its page', async () => {
  const text = await infoPage('shortcuts');
  const main = mainOf(text);
  assert.ok(main.includes('<a class="info-back" href="/">'));
  assert.ok(main.includes('<p class="info-hint"><span>'));
  assert.ok(main.includes('<kbd class="k-kbd">?</kbd>'));
  assert.ok(main.includes('<a href="/shortcuts" aria-current="page">'));
  assert.ok(!main.includes('<a href="/guide" aria-current'));
  assert.ok(
    !(/<header class="k-bar">[\s\S]*?<\/header>/.exec(text)?.[0] ?? '').includes('aria-current'),
  );
});

test('every row of the table renders its label', async () => {
  const text = await infoPage('shortcuts');
  assert.equal(count(text, '<li class="info-key"'), SHORTCUT_ROWS.length);
  for (const row of SHORTCUT_ROWS) {
    assert.ok(rowOf(text, row.id).includes(escapeHtml(t(`studio.edit.${row.label}`))), row.id);
  }
});

test('Mod+Z is a Ctrl key the script can swap, and a plain Z', async () => {
  const row = rowOf(await infoPage('shortcuts'), 'undo');
  assert.ok(row.includes('<kbd class="k-kbd" data-mod>Ctrl</kbd>'));
  assert.ok(row.includes('<kbd class="k-kbd">Z</kbd>'));
  assert.ok(row.includes('<span class="info-plus">+</span>'));
});

test('ways are joined by the word the editor uses, and gestures are said as it says them', async () => {
  const text = await infoPage('shortcuts');
  const redo = rowOf(text, 'redo');
  assert.ok(
    redo.includes(`<span class="k-meta">${escapeHtml(t('studio.edit.shortcuts.or'))}</span>`),
  );
  assert.ok(redo.includes('<kbd class="k-kbd" data-mod>Ctrl</kbd>'));
  assert.ok(redo.includes('<kbd class="k-kbd">Y</kbd>'));
  const zoom = rowOf(text, 'zoom-wheel');
  assert.ok(
    zoom.includes(`<kbd class="k-kbd">${escapeHtml(t('studio.edit.shortcuts.key.wheel'))}</kbd>`),
  );
  assert.ok(
    zoom.includes(`<kbd class="k-kbd">${escapeHtml(t('studio.edit.shortcuts.key.pinch'))}</kbd>`),
  );
  assert.ok(rowOf(text, 'clear').includes('<kbd class="k-kbd">Esc</kbd>'));
  assert.ok(rowOf(text, 'move-up').includes('<kbd class="k-kbd" data-alt>Alt</kbd>'));
});
