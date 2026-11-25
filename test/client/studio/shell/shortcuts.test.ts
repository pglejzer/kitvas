import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SHELL_KEYS,
  type ShellKeyLike,
  shellKeyOf,
} from '../../../../client/channel/canvas-protocol.ts';
import { EDIT_KEYS } from '../../../../client/channel/edit-protocol.ts';
import { keyOf } from '../../../../client/frame/edit/keys.ts';
import { editKeyOf, historyKeyOf } from '../../../../client/studio/edit/select/keys.ts';
import {
  isMac,
  keyNames,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  shortcutHint,
  shortcutSections,
} from '../../../../client/studio/shell/shortcuts.ts';
import { SHORTCUT_ROWS } from '../../../../src/studio/views/shortcuts.ts';

/** Texts as their keys, as the page shows a key it was not sent. */
const say = (key: string): string => key;

/** The key press a table entry describes; `Mod` is Ctrl. Digits carry their `code`. */
function pressOf(combo: string): ShellKeyLike {
  const parts = combo.split('+');
  const key = parts[parts.length - 1] ?? '';
  return {
    key,
    code: /^[0-9]$/.test(key) ? `Digit${key}` : '',
    ctrlKey: parts.includes('Mod') || parts.includes('Ctrl'),
    metaKey: false,
    altKey: parts.includes('Alt'),
    shiftKey: parts.includes('Shift'),
  };
}

const ids = SHORTCUTS.map((item) => item.id);
const screenKeys: readonly string[] = SHELL_KEYS;

test('every screen key and every editor key is listed once', () => {
  for (const key of [...SHELL_KEYS, ...EDIT_KEYS]) {
    assert.equal(ids.filter((id) => id === key).length, 1, key);
  }
  assert.equal(new Set(ids).size, ids.length, 'no shortcut is listed twice');
});

test('the screen keys of the table are the keys the screen hears', () => {
  const listed = SHORTCUTS.filter((item) => screenKeys.includes(item.id));
  assert.equal(listed.length, SHELL_KEYS.length);
  for (const item of listed) {
    for (const combo of item.keys) assert.equal(shellKeyOf(pressOf(combo)), item.id, combo);
  }
});

test('the editor keys of the table are the keys the page and the frame hear', () => {
  for (const item of SHORTCUTS.filter((entry) => entry.group === 'structure')) {
    for (const combo of item.keys) assert.equal(editKeyOf(pressOf(combo)), item.id, combo);
  }
  for (const item of SHORTCUTS.filter((entry) => entry.group === 'history')) {
    for (const combo of item.keys) assert.equal(historyKeyOf(pressOf(combo)), item.id, combo);
  }
  for (const id of ['clear', 'parent', 'child'] as const) {
    const item = SHORTCUTS.find((entry) => entry.id === id);
    assert.ok(item);
    for (const combo of item.keys) assert.equal(keyOf(pressOf(combo)), id, combo);
  }
});

test('every shortcut has a group the list shows, a text key and at least one way to press', () => {
  for (const item of SHORTCUTS) {
    assert.ok(SHORTCUT_GROUPS.includes(item.group), item.id);
    assert.match(item.label, /^shortcuts\.[a-z-]+$/, item.id);
    assert.ok(item.keys.length > 0, item.id);
  }
});

test('Ctrl reads Cmd and Alt reads Option on a Mac; arrows and Esc read as people know them', () => {
  assert.equal(isMac('MacIntel'), true);
  assert.equal(isMac('iPhone'), true);
  assert.equal(isMac('Win32'), false);
  assert.equal(isMac('Linux x86_64'), false);
  assert.deepEqual(keyNames('Mod+Shift+Z', false, say), ['Ctrl', 'Shift', 'Z']);
  assert.deepEqual(keyNames('Mod+Shift+Z', true, say), ['Cmd', 'Shift', 'Z']);
  assert.deepEqual(keyNames('Alt+ArrowUp', true, say), ['Option', '↑']);
  assert.deepEqual(keyNames('Escape', false, say), ['Esc']);
  assert.deepEqual(keyNames('Mod+\\', false, say), ['Ctrl', '\\']);
  // Ctrl+Y stays Ctrl on a Mac, where Cmd+Y is no redo.
  assert.deepEqual(keyNames('Ctrl+Y', true, say), ['Ctrl', 'Y']);
  // Words that are not a key's name are texts.
  assert.deepEqual(keyNames('Space+Drag', false, say), ['Space', 'shortcuts.key.drag']);
  assert.deepEqual(keyNames('ContextMenu', false, say), ['shortcuts.key.menu']);
});

test('the list shows every group in order, with every shortcut once', () => {
  const all = shortcutSections('', false, say);
  assert.deepEqual(
    all.map((section) => section.group),
    [...SHORTCUT_GROUPS],
  );
  const lines = all.flatMap((section) => section.lines.map((line) => line.id));
  assert.deepEqual(lines.toSorted(), [...ids].sort());
});

test('the search keeps what matches every word, in the texts or in the keys', () => {
  const texts = (key: string): string =>
    key === 'shortcuts.wrap' ? 'Wrap in a stack' : key === 'shortcuts.unwrap' ? 'Unwrap' : key;
  const idsOf = (query: string): string[] =>
    shortcutSections(query, false, texts).flatMap((section) =>
      section.lines.map((line) => line.id),
    );
  assert.deepEqual(idsOf('WRAP'), ['wrap', 'unwrap']);
  assert.deepEqual(idsOf('wrap stack'), ['wrap']);
  assert.deepEqual(idsOf('shift+g'), ['unwrap']);
  assert.deepEqual(idsOf('nothing like this'), []);
});

test('every row of the shared table is a screen key, an editor key or a gesture', () => {
  const allowed: readonly string[] = [...SHELL_KEYS, ...EDIT_KEYS, 'add', 'zoom-wheel', 'pan'];
  for (const row of SHORTCUT_ROWS) assert.ok(allowed.includes(row.id), row.id);
  assert.deepEqual(
    SHORTCUTS.map((item) => item.id),
    SHORTCUT_ROWS.map((row) => row.id),
  );
});

test('the context menu reads its key hint from the same table', () => {
  assert.equal(shortcutHint('duplicate', false, say), 'Ctrl+D');
  assert.equal(shortcutHint('duplicate', true, say), 'Cmd+D');
  assert.equal(shortcutHint('move-up', false, say), 'Alt+↑');
  assert.equal(shortcutHint('menu', false, say), 'Shift+F10');
  assert.equal(shortcutHint('wrap-stack', false, say), null);
});
