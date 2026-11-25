// The editor's shortcuts as plain data: the `?` list in the editor and the Shortcuts page both read
// this table. Keys are written as the browser names them (`event.key`), parts joined by `+`; `Mod`
// is Ctrl, or Cmd on a Mac. A word that is not a key's name (wheel, drag, click) is a text key.

export type ShortcutGroup = 'screen' | 'canvas' | 'selection' | 'history' | 'structure';
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  'screen',
  'canvas',
  'selection',
  'history',
  'structure',
];

export type ShortcutRow = {
  /** A screen key, an editor key, or a gesture (`add`, `zoom-wheel`, `pan`). */
  id: string;
  /** Each way to do it. */
  keys: string[];
  /** Its text, a key under `studio.edit.`. */
  label: string;
  group: ShortcutGroup;
};

export const SHORTCUT_ROWS: readonly ShortcutRow[] = [
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
  { id: 'select-all', keys: ['Mod+A'], label: 'shortcuts.select-all', group: 'selection' },
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

/** Names that are words for people, not a key's name: the text key (under `studio.edit.`) says each. */
export const KEY_WORDS: Readonly<Record<string, string>> = {
  Wheel: 'shortcuts.key.wheel',
  Pinch: 'shortcuts.key.pinch',
  Drag: 'shortcuts.key.drag',
  MiddleDrag: 'shortcuts.key.middle',
  Click: 'shortcuts.key.click',
  ContextMenu: 'shortcuts.key.menu',
};

/** How a key's name is written for people. */
export const KEY_SHOWN: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
