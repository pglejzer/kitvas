// The editor screen on the draft page (plan 15, task A; plan 18, task A): the top bar's menus, the
// rail and the side panels with their tabs, grips and folds, the narrow-window overlays, the screen
// keys on the page and the `?` list of shortcuts (also in the bar's More menu). It runs on every
// draft page, editable or not, before the canvas and the
// editor start; the Preview | Edit switch belongs to the editor (`edit/mode.ts`), and the screen
// hears the mode from `main.dataset.mode`.

import { shellKeyOf } from '../../channel/canvas-protocol.ts';
import { emitShellKey, onShellKey } from './bus.ts';
import { mountMenus } from './menus.ts';
import { mountPanels } from './panels.ts';
import { mountShortcuts } from './shortcuts-dialog.ts';

/** Focus in a field, where the keys belong to the typing. */
function inField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

export function mountShell(main: HTMLElement): void {
  const menus = mountMenus(main);
  const panels = mountPanels(main);
  const shortcuts = mountShortcuts(main);

  // A key pressed on the page reaches the bus here; a key pressed in a frame comes as a message
  // (task B). Typing in a field keeps its keys.
  document.addEventListener('keydown', (event) => {
    // The open list takes Esc and the typing in its search field for itself.
    if (event.defaultPrevented || event.isComposing || shortcuts.isOpen()) return;
    if (event.key === 'Escape') {
      if (menus.closeAll(true)) event.preventDefault();
      // The context menu closes first; the panel over the canvas waits for the next Esc.
      else if (!main.querySelector('[data-edit="menu"]:not([hidden])') && panels.closeOverlay()) {
        event.preventDefault();
      }
      return;
    }
    if (inField(event.target)) return;
    const key = shellKeyOf(event);
    if (key === null) return;
    event.preventDefault();
    emitShellKey(key);
  });

  onShellKey((key) => {
    if (key === 'fold-left') panels.toggle('left');
    else if (key === 'fold-right') panels.toggle('right');
    else if (key === 'fold-both') panels.toggleBoth();
    else if (key === 'shortcuts') shortcuts.toggle();
  });
}
