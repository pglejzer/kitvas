// The Shortcuts page writes `Mod` as "Ctrl" and `Alt` as "Alt" (`kbd[data-mod]`, `kbd[data-alt]`).
// On an Apple platform they read Cmd and Option, as the editor's own list says them.

import { isMac } from '../shell/shortcuts.ts';

/** What the swap needs of a key: its text, which it may replace. */
export type KeyText = { textContent: string | null };

/** Sets the names Apple's platforms use; leaves the keys alone anywhere else. */
export function swapModKeys(
  platform: string,
  mods: Iterable<KeyText>,
  alts: Iterable<KeyText> = [],
): void {
  if (!isMac(platform)) return;
  for (const key of mods) key.textContent = 'Cmd';
  for (const key of alts) key.textContent = 'Option';
}

/** Swaps every `[data-mod]` and `[data-alt]` key of the page. */
export function mountModKeys(root: ParentNode = document): void {
  swapModKeys(
    navigator.platform,
    root.querySelectorAll('kbd[data-mod]'),
    root.querySelectorAll('kbd[data-alt]'),
  );
}
