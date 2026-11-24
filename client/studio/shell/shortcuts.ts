// Every shortcut of the editor screen in one table (plan 15, task A, spec goal 10). The `?` list
// reads it, and so may the context menu for its key hints: `shortcutHint(id)`. Keys are written
// as the browser names them (`event.key`), parts joined by `+`; `Mod` is Ctrl, or Cmd on a Mac.
// A word that is not a key's name (wheel, drag, click) is a text key, said through `say`.

import type { ShellKey } from '../../channel/canvas-protocol.ts';
import type { EditKey } from '../../channel/edit-protocol.ts';

export type ShortcutGroup = 'screen' | 'canvas' | 'selection' | 'history' | 'structure';
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  'screen',
  'canvas',
  'selection',
  'history',
  'structure',
];

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

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'fold-left', keys: ['['], label: 'shortcuts.fold-left', group: 'screen' },
  { id: 'fold-right', keys: [']'], label: 'shortcuts.fold-right', group: 'screen' },
  { id: 'fold-both', keys: ['Mod+\\'], label: 'shortcuts.fold-both', group: 'screen' },
  { id: 'shortcuts', keys: ['?'], label: 'shortcuts.shortcuts', group: 'screen' },
  { id: 'fit', keys: ['Shift+1'], label: 'shortcuts.fit', group: 'canvas' },
  { id: 'selection', keys: ['Shift+2'], label: 'shortcuts.selection', group: 'canvas' },
  { id: 'actual', keys: ['Mod+0'], label: 'shortcuts.actual', group: 'canvas' },
  { id: 'zoom-wheel', keys: ['Mod+Wheel', 'Pinch'], label: 'shortcuts.zoom', group: 'canvas' },
  { id: 'pan', keys: ['Space+Drag', 'MiddleDrag'], label: 'shortcuts.pan', group: 'canvas' },
  { id: 'clear', keys: ['Escape'], label: 'shortcuts.clear', group: 'selection' },
  { id: 'parent', keys: ['ArrowUp'], label: 'shortcuts.parent', group: 'selection' },
  { id: 'child', keys: ['ArrowDown'], label: 'shortcuts.child', group: 'selection' },
  { id: 'add', keys: ['Shift+Click'], label: 'shortcuts.add', group: 'selection' },
  { id: 'undo', keys: ['Mod+Z'], label: 'shortcuts.undo', group: 'history' },
  { id: 'redo', keys: ['Mod+Shift+Z', 'Ctrl+Y'], label: 'shortcuts.redo', group: 'history' },
  { id: 'delete', keys: ['Delete', 'Backspace'], label: 'shortcuts.delete', group: 'structure' },
  { id: 'duplicate', keys: ['Mod+D'], label: 'shortcuts.duplicate', group: 'structure' },
  { id: 'copy', keys: ['Mod+C'], label: 'shortcuts.copy', group: 'structure' },
  { id: 'cut', keys: ['Mod+X'], label: 'shortcuts.cut', group: 'structure' },
  { id: 'paste', keys: ['Mod+V'], label: 'shortcuts.paste', group: 'structure' },
  { id: 'move-up', keys: ['Alt+ArrowUp'], label: 'shortcuts.move-up', group: 'structure' },
  { id: 'move-down', keys: ['Alt+ArrowDown'], label: 'shortcuts.move-down', group: 'structure' },
  { id: 'wrap', keys: ['Mod+G'], label: 'shortcuts.wrap', group: 'structure' },
  { id: 'unwrap', keys: ['Mod+Shift+G'], label: 'shortcuts.unwrap', group: 'structure' },
  { id: 'menu', keys: ['Shift+F10', 'ContextMenu'], label: 'shortcuts.menu', group: 'structure' },
];

/** Says a text key (`text` from `edit/texts.ts`; a plain function in tests). */
export type Say = (key: string) => string;

/** Names that are words for people, not a key's name. */
const WORDS: Readonly<Record<string, string>> = {
  Wheel: 'shortcuts.key.wheel',
  Pinch: 'shortcuts.key.pinch',
  Drag: 'shortcuts.key.drag',
  MiddleDrag: 'shortcuts.key.middle',
  Click: 'shortcuts.key.click',
  ContextMenu: 'shortcuts.key.menu',
};

const SHOWN: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Whether the platform is Apple's, where Ctrl reads Cmd and Alt reads Option. */
export function isMac(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** One way to press, as people read it: `Mod+Shift+Z` is `["Ctrl", "Shift", "Z"]`. */
export function keyNames(combo: string, mac: boolean, say: Say): string[] {
  return combo.split('+').map((part) => {
    if (part === 'Mod') return mac ? 'Cmd' : 'Ctrl';
    if (part === 'Alt' && mac) return 'Option';
    const word = WORDS[part];
    if (word !== undefined) return say(word);
    return SHOWN[part] ?? part;
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
