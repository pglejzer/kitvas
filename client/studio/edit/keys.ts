// The editor's keys (spec 4b, keyboard; plan 14, task D3): the frame's `key` messages and the same keys
// pressed on the page, turned into `runAction` calls. Never while focus is in a text field.

import type { EditKey } from '../../channel/edit-protocol.ts';
import { type ActionId, type ActionState, actionsFor, runAction } from './actions.ts';
import type { EditorContext } from './context.ts';
import { openMenuFromKey } from './menu.ts';

/** The parts of a keyboard event the mapping reads, so tests need no DOM. */
export type KeyLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** What a key does; `wrap` is the default wrap, the one in a stack. */
const ACTION_OF: Partial<Record<EditKey, ActionId>> = {
  delete: 'delete',
  duplicate: 'duplicate',
  copy: 'copy',
  cut: 'cut',
  paste: 'paste',
  'move-up': 'move-up',
  'move-down': 'move-down',
  wrap: 'wrap-stack',
  unwrap: 'unwrap',
};

/** The action a structure key runs; `null` for `menu` and for the keys other panels own. */
export function actionOfKey(key: EditKey): ActionId | null {
  return ACTION_OF[key] ?? null;
}

/**
 * Undo or redo on the page, as in the frame: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y.
 * `null` for any other key.
 */
export function historyKeyOf(event: KeyLike): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const name = event.key.toLowerCase();
  if (name === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (name === 'y' && !event.shiftKey) return 'redo';
  return null;
}

/** The structure key a keyboard event is, or `null`. The same table as the frame's keys. */
export function editKeyOf(event: KeyLike): EditKey | null {
  const mod = event.ctrlKey || event.metaKey;
  const name = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!mod && !event.altKey) {
    if (name === 'Delete' || name === 'Backspace') return 'delete';
    if (name === 'ContextMenu') return 'menu';
    if (name === 'F10' && event.shiftKey) return 'menu';
    return null;
  }
  if (event.altKey && !mod) {
    if (name === 'ArrowUp') return 'move-up';
    if (name === 'ArrowDown') return 'move-down';
    return null;
  }
  if (!mod || event.altKey) return null;
  if (name === 'g') return event.shiftKey ? 'unwrap' : 'wrap';
  if (event.shiftKey) return null;
  if (name === 'd') return 'duplicate';
  if (name === 'c') return 'copy';
  if (name === 'x') return 'cut';
  if (name === 'v') return 'paste';
  return null;
}

/** The parts of an event target the text field check reads. */
export type TargetLike = { tagName?: string; isContentEditable?: boolean } | null;

/** Focus in a field where the keys belong to the text: inputs, selects, textareas, contenteditable. */
export function isTextTarget(target: TargetLike): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

/**
 * What a key does now: the action to run, `'menu'` to open the menu, or `null` when nothing happens
 * (an action that is off does nothing; its reason is in the menu).
 */
export function resolveKey(
  key: EditKey,
  actions: readonly ActionState[],
): ActionId | 'menu' | null {
  if (key === 'menu') return 'menu';
  const id = actionOfKey(key);
  if (id === null) return null;
  return actions.some((action) => action.id === id && action.enabled) ? id : null;
}

export function mountKeys(ctx: EditorContext): void {
  const { store, bridge, history } = ctx;

  function press(key: EditKey): boolean {
    const state = store.get();
    if (!state.on) return false;
    const todo = resolveKey(key, actionsFor(state));
    if (todo === null) return false;
    if (todo === 'menu') openMenuFromKey(ctx);
    else void runAction(ctx, todo);
    return true;
  }

  bridge.on((message) => {
    if (message.type === 'key') press(message.key);
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || store.get().menu) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (isTextTarget(target)) return;
    const back = store.get().on ? historyKeyOf(event) : null;
    if (back !== null) {
      event.preventDefault();
      void (back === 'undo' ? history.undo() : history.redo());
      return;
    }
    const key = editKeyOf(event);
    if (key === null) return;
    // Copy of text the person selected on the page stays the browser's.
    if (key === 'copy' && (window.getSelection()?.toString() ?? '') !== '') return;
    if (press(key)) event.preventDefault();
  });
}
