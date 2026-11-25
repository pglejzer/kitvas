// Every shortcut of the editor screen in one table (plan 15, task A, spec goal 10). The `?` list
// reads it, and so may the context menu for its key hints: `shortcutHint(id)`. Keys are written
// as the browser names them (`event.key`), parts joined by `+`; `Mod` is Ctrl, or Cmd on a Mac.
// A word that is not a key's name (wheel, drag, click) is a text key, said through `say`. The rows
// are `src/studio/views/shortcuts.ts`, which the Shortcuts page reads too.

import {
  KEY_SHOWN,
  KEY_WORDS,
  SHORTCUT_GROUPS,
  SHORTCUT_ROWS,
  type ShortcutGroup,
} from '../../../src/studio/views/shortcuts.ts';
import type { ShellKey } from '../../channel/canvas-protocol.ts';
import type { EditKey } from '../../channel/edit-protocol.ts';

export { SHORTCUT_GROUPS, type ShortcutGroup };

/** Pointer gestures listed beside the keys. */
export type GestureId = 'add' | 'zoom-wheel' | 'pan';

export type Shortcut = {
  /** A screen key (`SHELL_KEYS`), an editor key (`EDIT_KEYS`), or a gesture. */
  id: ShellKey | EditKey | GestureId;
  /** Each way to do it. */
  keys: string[];
  /** Its text, a key under `studio.edit.`. */
  label: string;
  group: ShortcutGroup;
};

/** The table's rows; the test holds each id to a screen key, an editor key or a gesture. */
export const SHORTCUTS: readonly Shortcut[] = SHORTCUT_ROWS.map((row) => ({
  ...row,
  id: row.id as Shortcut['id'],
}));

/** Says a text key (`text` from `edit/texts.ts`; a plain function in tests). */
export type Say = (key: string) => string;

/** Whether the platform is Apple's, where Ctrl reads Cmd and Alt reads Option. */
export function isMac(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** One way to press, as people read it: `Mod+Shift+Z` is `["Ctrl", "Shift", "Z"]`. */
export function keyNames(combo: string, mac: boolean, say: Say): string[] {
  return combo.split('+').map((part) => {
    if (part === 'Mod') return mac ? 'Cmd' : 'Ctrl';
    if (part === 'Alt' && mac) return 'Option';
    const word = KEY_WORDS[part];
    if (word !== undefined) return say(word);
    return KEY_SHOWN[part] ?? part;
  });
}

export type ShortcutLine = { id: Shortcut['id']; label: string; keys: string[][] };
export type ShortcutSection = { group: ShortcutGroup; title: string; lines: ShortcutLine[] };

/** Every word of the search is found in the line's text, its group or its keys. */
function matches(line: ShortcutLine, title: string, words: readonly string[]): boolean {
  const haystack = [line.label, title, ...line.keys.map((combo) => combo.join('+'))]
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** The list as the dialog shows it, by group in the table's order, filtered by `query`. */
export function shortcutSections(query: string, mac: boolean, say: Say): ShortcutSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const sections: ShortcutSection[] = [];
  for (const group of SHORTCUT_GROUPS) {
    const title = say(`shortcuts.group.${group}`);
    const lines = SHORTCUTS.filter((item) => item.group === group)
      .map((item) => ({
        id: item.id,
        label: say(item.label),
        keys: item.keys.map((combo) => keyNames(combo, mac, say)),
      }))
      .filter((line) => matches(line, title, words));
    if (lines.length > 0) sections.push({ group, title, lines });
  }
  return sections;
}

/**
 * The first way to press `id`, as people read it (`Ctrl+D`); `null` when the table has none. The
 * context menu shows it beside an action whose editor key is `id`.
 */
export function shortcutHint(id: string, mac: boolean, say: Say): string | null {
  const first = SHORTCUTS.find((item) => item.id === id)?.keys[0];
  return first === undefined ? null : keyNames(first, mac, say).join('+');
}
