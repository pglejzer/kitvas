import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Draft } from '../../../../src/drafts/index.ts';
import { choiceLink } from '../../../../src/studio/pages/draft/draft-links.ts';
import {
  type BarInput,
  editBlock,
  editorBar,
} from '../../../../src/studio/pages/editor/editor-bar.ts';
import { escapeHtml } from '../../../../src/studio/pages/html.ts';
import type { DraftChoice } from '../../../../src/studio/views/draft-query.ts';
import { t } from '../../../helpers/translate.ts';

const DRAFT: Draft = {
  schemaVersion: 1,
  slug: 'shop',
  title: 'Shop',
  kind: 'screen',
  kit: { id: 'base', version: '0.1.0', hash: 'a'.repeat(64) },
  createdAt: '2026-11-22T10:00:00.000Z',
  versions: [
    { number: 1, createdAt: '2026-11-22T10:00:00.000Z' },
    { number: 2, createdAt: '2026-11-22T11:00:00.000Z' },
  ],
};

const CHOICE: DraftChoice = { version: 2, state: 'filled', width: 390 };

function bar(fields: Partial<BarInput> = {}): string {
  const draft = fields.draft ?? DRAFT;
  const choice = fields.choice ?? CHOICE;
  return editorBar({
    t,
    draft,
    choice,
    link: choiceLink(draft, choice),
    latest: 2,
    block: null,
    status: { kind: 'checked', fix: 2, review: 1 },
    ...fields,
  }).text;
}

/** The part of the bar between two marks, to check what sits where. */
const between = (text: string, from: string, to: string): string =>
  text.slice(text.indexOf(from), text.indexOf(to));

test('the bar is the shared bar in three parts: the draft, the mode and the actions', () => {
  const text = bar();
  assert.ok(text.startsWith('<header class="k-bar bar-editor"><div class="k-bar-start">'));
  const start = text.indexOf('k-bar-start');
  const mid = text.indexOf('k-bar-mid');
  const end = text.indexOf('k-bar-end');
  assert.ok(start > 0 && mid > start && end > mid);
  assert.ok(!text.includes('style='));
});

test('the start says Drafts / title, Drafts a link to the gallery, then the version menu', () => {
  const text = bar();
  const start = between(text, 'k-bar-start', 'k-bar-mid');
  assert.ok(start.includes('<span class="k-mark">kitvas</span>'));
  assert.ok(start.includes(`<a class="k-btn bar-crumb" href="/">${t('studio.nav.drafts')}</a>`));
  assert.ok(start.includes('<span class="bar-slash" aria-hidden="true">/</span>'));
  assert.ok(start.includes('<h1 class="bar-title k-clip" title="Shop">Shop</h1>'));
  assert.ok(start.indexOf('bar-title') < start.indexOf('data-shell="version"'));
});

test('the version menu lists every version newest first, the shown one marked', () => {
  const text = bar({ choice: { ...CHOICE, version: 1 } });
  const menu = /<details class="bar-menu" data-shell="version">.*?<\/details>/.exec(text)?.[0];
  assert.ok(menu, 'the menu is there');
  assert.ok(menu.includes('<summary class="k-btn">Version 1'));
  const items = [...menu.matchAll(/<a class="k-menu-item" href="([^"]+)"([^>]*)>/g)];
  assert.deepEqual(
    items.map((item) => item[1]),
    [
      escapeHtml('/drafts/shop?version=2&state=filled&width=390'),
      escapeHtml('/drafts/shop?version=1&state=filled&width=390'),
    ],
  );
  assert.ok(items[1]?.[2]?.includes('aria-current="true"'));
  assert.equal(items[0]?.[2]?.includes('aria-current'), false);
  // The latest says so, in the list and in the summary when it is the one shown.
  assert.ok(menu.includes(`<span class="k-meta">${t('studio.edit.shell.latest')}</span>`));
  assert.ok(menu.includes('<ul class="k-pop k-menu bar-list" role="list"'));
});

test('Preview | Edit is one segmented control; Edit is off with the reason when blocked', () => {
  const open = bar();
  assert.ok(open.includes('<div class="k-seg bar-modes" role="group"'));
  assert.ok(open.includes('data-shell-mode="preview" aria-pressed="true"'));
  assert.ok(open.includes('data-shell-mode="edit" aria-pressed="false">'));
  const old = bar({ choice: { ...CHOICE, version: 1 }, block: 'old' });
  const reason = escapeHtml(t('studio.edit.shell.reason.old'));
  assert.ok(old.includes(`data-shell-mode="edit" aria-pressed="false" disabled title="${reason}"`));
});

test('an editable version has every hook of the session in the bar', () => {
  const text = bar();
  const end = text.slice(text.indexOf('k-bar-end'));
  for (const hook of [
    '<span class="bar-listen" data-edit-listening></span>',
    'data-edit-session role="status"',
    'data-edit-undo disabled',
    'data-edit-redo disabled',
    'data-edit-unsave hidden',
    'data-edit-save disabled',
    'data-view-open',
    'data-shell="shortcuts"',
  ]) {
    assert.ok(end.includes(hook), hook);
  }
  assert.ok(end.includes(`aria-label="${t('studio.edit.shell.undo')}"`));
  assert.ok(
    end.includes('<button type="button" class="k-btn k-btn-primary bar-save" data-edit-save'),
  );
  // Save version is the last thing in the bar.
  assert.ok(text.endsWith(`${t('studio.edit.save')}</button></div></header>`));
});

test('undo and redo belong to Edit; the findings, the notes and Compare to Preview', () => {
  const text = bar();
  const edit = /<span class="bar-group bar-in-edit">(.*?)<\/span><span class="bar-group/.exec(text);
  assert.ok(edit?.[1]?.includes('data-edit-undo'));
  const preview = between(text, 'bar-in-preview', 'k-sep bar-sep');
  assert.ok(preview.includes('data-bar-findings'));
  assert.ok(preview.includes('data-bar-notes'));
  assert.ok(preview.includes('data-shell="compare"'));
  assert.ok(!preview.includes('data-edit-undo'));
});

test('the findings say what the checks found and open the Checks pane', () => {
  const text = bar();
  const button = /<button type="button" class="k-btn" data-bar-findings[^>]*>(.*?)<\/button>/.exec(
    text,
  );
  assert.ok(button, 'the findings are there');
  assert.ok(button[0].includes('data-open-pane="checks"'));
  assert.ok(button[1]?.includes('<span class="k-dot" data-state="fix" aria-hidden="true"></span>'));
  assert.ok(button[1]?.includes(t('studio.status.fix', { count: 2 })));
  const good = bar({ status: { kind: 'checked', fix: 0, review: 0 } });
  assert.ok(good.includes('data-state="good"'));
  assert.ok(good.includes(t('studio.status.good')));
  const unchecked = bar({ status: { kind: 'notChecked' } });
  assert.ok(unchecked.includes(t('studio.status.notChecked')));
  assert.ok(!/data-bar-findings[^>]*>[^<]*<span class="k-dot" data-state/.test(unchecked));
});

test('the notes button opens the Notes pane and waits hidden for its count', () => {
  const text = bar();
  const notes = /<button type="button" class="k-btn" data-bar-notes[^>]*>.*?<\/button>/.exec(text);
  assert.ok(notes, 'the notes are there');
  assert.ok(notes[0].includes('data-open-pane="notes"'));
  assert.ok(notes[0].includes(' hidden>'));
  assert.ok(notes[0].includes('<span class="k-count" data-count></span>'));
});

test('More holds Compare and the shortcuts, with the ? key beside them', () => {
  const text = bar();
  const more =
    /<div class="k-pop k-menu bar-list bar-list-end" data-shell="more">(.*?)<\/div><\/details>/.exec(
      text,
    )?.[1];
  assert.ok(more, 'More is there');
  assert.ok(more.includes(escapeHtml('/drafts/shop?version=2&state=filled&width=390&compare=1')));
  assert.ok(more.includes('<div class="k-menu-sep"></div>'));
  assert.ok(
    more.includes(
      `<button type="button" class="k-menu-item" data-shell="shortcuts">${t('studio.edit.shell.shortcuts')}<kbd class="k-kbd">?</kbd></button>`,
    ),
  );
  const summary = `<summary class="k-icon-btn" aria-label="${t('studio.edit.shell.more')}"`;
  assert.ok(text.includes(summary));
});

test('compare lists the other versions and, while comparing, a way to stop', () => {
  const text = bar({ choice: { ...CHOICE, compare: 1 }, block: 'compare' });
  const menu = /<details class="bar-menu" data-shell="compare">.*?<\/details>/.exec(text)?.[0];
  assert.ok(menu, 'the menu is there');
  assert.ok(menu.includes(escapeHtml(t('studio.edit.shell.comparing', { version: 1 }))));
  assert.ok(menu.includes('aria-current="true"'));
  assert.ok(menu.includes(escapeHtml(t('studio.draft.stopCompare'))));
  assert.ok(menu.includes('<ul class="k-pop k-menu bar-list bar-list-end"'));
});

test('with nothing to compare, Compare keeps its place, off, and says why', () => {
  const one: Draft = { ...DRAFT, versions: [{ number: 1, createdAt: DRAFT.createdAt }] };
  const text = bar({ draft: one, choice: { ...CHOICE, version: 1 }, latest: 1 });
  const none = escapeHtml(t('studio.edit.shell.compareNone'));
  assert.ok(
    text.includes(
      `<button type="button" class="k-btn" data-shell="compare" disabled title="${none}">`,
    ),
  );
  assert.ok(text.includes(`<p class="k-meta bar-list-head">${none}</p>`));
});

test('a version that cannot be edited has no session controls, only the findings and Compare', () => {
  const text = bar({ choice: { ...CHOICE, version: 1 }, block: 'old' });
  for (const hook of [
    'data-edit-save',
    'data-edit-undo',
    'data-edit-listening',
    'data-bar-notes',
  ]) {
    assert.ok(!text.includes(hook), hook);
  }
  assert.ok(text.includes('data-bar-findings'));
  assert.ok(text.includes('data-shell="compare"'));
  assert.ok(text.includes('data-view-open'));
});

test('only the latest built version, outside compare, can be edited', () => {
  assert.equal(editBlock({ built: true, version: 2, latest: 2, compare: null }), null);
  assert.equal(editBlock({ built: true, version: 2, latest: 2, compare: 1 }), 'compare');
  assert.equal(editBlock({ built: true, version: 1, latest: 2, compare: null }), 'old');
  assert.equal(editBlock({ built: false, version: 2, latest: 2, compare: null }), 'unbuilt');
});

test('a title from a file is escaped', () => {
  const text = bar({ draft: { ...DRAFT, title: '"><script>x</script>' } });
  assert.ok(!text.includes('<script>'));
});
