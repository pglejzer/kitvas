// The editor key a key press in the frame stands for. Pure, so it is tested without a DOM. The
// edit mode in `edit.ts` never asks while an inline text edit runs: typing belongs to the text.

import type { EditKey } from '../../channel/edit-protocol.ts';

export type KeyLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** Ctrl or Cmd with a letter (and Shift for the few that take it). */
const COMMANDS: ReadonlyMap<string, EditKey> = new Map([
  // Also keeps the page's own select-all from marking the prototype's text.
  ['a', 'select-all'],
  ['d', 'duplicate'],
  ['c', 'copy'],
  ['x', 'cut'],
  ['v', 'paste'],
  ['k', 'ask'],
]);

/** The editor key a key press stands for; `undefined` for a key the page keeps. */
export function keyOf(event: KeyLike): EditKey | undefined {
  const letter = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  if (event.altKey) {
    // Alt alone moves; with Ctrl or Cmd the press means something else.
    if (command || event.shiftKey) return undefined;
    if (event.key === 'ArrowUp') return 'move-up';
    if (event.key === 'ArrowDown') return 'move-down';
    return undefined;
  }
  if (command) {
    if (letter === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (letter === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) return 'redo';
    if (letter === 'g') return event.shiftKey ? 'unwrap' : 'wrap';
    if (event.shiftKey) return undefined;
    return COMMANDS.get(letter);
  }
  if (event.shiftKey) return event.key === 'F10' ? 'menu' : undefined;
  if (event.key === 'Escape') return 'clear';
  if (event.key === 'ArrowUp') return 'parent';
  if (event.key === 'ArrowDown') return 'child';
  if (event.key === 'ArrowLeft') return 'variant-prev';
  if (event.key === 'ArrowRight') return 'variant-next';
  if (event.key === 'Delete' || event.key === 'Backspace') return 'delete';
  if (event.key === 'ContextMenu') return 'menu';
  return undefined;
}
