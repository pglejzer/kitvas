// The editor's keys (spec 4b, keyboard; plan 14, task D3): the frame's `key` messages and the same keys
// pressed on the page, turned into `runAction` calls. Never while focus is in a text field. A key
// whose action is off says why over the canvas (ADR 0065), and select-all selects the siblings.

import type { EditKey } from '../../../channel/edit-protocol.ts';
import { focusAsk } from '../ask/focus.ts';
import type { EditorContext } from '../context.ts';
import { stepVariant } from '../seltools/step.ts';
import {
  type ActionId,
  type ActionReason,
  type ActionState,
  actionsFor,
  runAction,
} from '../structure/actions.ts';
import { openMenuFromKey } from '../structure/menu.ts';
import { sayReason } from '../structure/refusal-note.ts';
import { sameChosen } from './copies.ts';
import { selectAll } from './select-all.ts';

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
    if (event.shiftKey) return null;
    if (name === 'ArrowLeft') return 'variant-prev';
    if (name === 'ArrowRight') return 'variant-next';
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
  if (name === 'a') return 'select-all';
  if (name === 'd') return 'duplicate';
  if (name === 'c') return 'copy';
  if (name === 'x') return 'cut';
  if (name === 'v') return 'paste';
  if (name === 'k') return 'ask';
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
 * What a key does now: the action to run, `'menu'` to open the menu, or `null` when no action
 * runs (one that is off says why, `offReason`).
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

/** Why the action of `key` is off now; `null` when it is on, and for a key with no action. */
export function offReason(key: EditKey, actions: readonly ActionState[]): ActionReason | null {
  const id = actionOfKey(key);
  const action = id === null ? undefined : actions.find((one) => one.id === id);
  return action === undefined || action.enabled ? null : action.reason;
}

export function mountKeys(ctx: EditorContext): void {
  const { store, bridge, history } = ctx;

  /** Whether the editor took the key: the page's own answer to it is then stopped. */
  function press(key: EditKey): boolean {
    const state = store.get();
    if (!state.on) return false;
    if (key === 'select-all') {
      const all = selectAll(state);
      if (all !== null && !sameChosen(all, state)) store.set(all);
      return true;
    }
    // Plan 19: the ask bar and the variant pill answer their own keys; with none, the key is free.
    if (key === 'ask') return focusAsk();
    if (key === 'variant-prev') return stepVariant(-1);
    if (key === 'variant-next') return stepVariant(1);
    const actions = actionsFor(state);
    const todo = resolveKey(key, actions);
    if (todo === null) {
      const off = offReason(key, actions);
      if (off === null) return false;
      sayReason(ctx.main, off);
      return true;
    }
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
    // Ctrl or Cmd with K reaches the ask bar from a field too: there is one place to type to Claude.
    if (editKeyOf(event) === 'ask') {
      if (press('ask')) event.preventDefault();
      return;
    }
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
