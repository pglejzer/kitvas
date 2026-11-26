// The canvas pills' menus, the state menu, "More" and the narrowed Lens pill's (plan 18f, task 5;
// plan 25). The first two are a `<details>` the server drew (`details[data-pill-menu]`), so they
// open without the script; the third the lens pill's script draws the same way. This adds what a
// menu does for a keyboard: the arrows walk the rows, Home and End jump, Escape closes and puts the
// focus back on the button, a pick closes, Tab out and a click elsewhere close, and one menu open
// closes the other.

import { isPlainClick } from '../clicks.ts';

const MENU = 'details[data-pill-menu]';
/** What a pick is: a size, a state, a card count, "Every width", a lens. */
const CHOOSE =
  'a[data-dock-size], a[data-state], a[data-dock-cards], button[data-dock-every], button[data-lens-pick]';
const ITEMS = 'a[href], button:not(:disabled), input:not([type="hidden"])';

/**
 * Where the focus goes for `key` among `count` rows, from row `index` (-1: the button).
 * `null`: not a key that moves the focus.
 */
export function stepFocus(count: number, index: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return index < 0 ? 0 : (index + 1) % count;
  if (key === 'ArrowUp') return index <= 0 ? count - 1 : index - 1;
  return null;
}

function close(menu: HTMLDetailsElement, focus: boolean): void {
  menu.open = false;
  if (focus) menu.querySelector('summary')?.focus();
}

/**
 * The rows a person can reach in an open menu, in order: not those the markup hides, nor those the
 * skin hides at a step of the fit (the presets in More while the pill shows them itself).
 */
function itemsOf(menu: HTMLDetailsElement): HTMLElement[] {
  const list = menu.querySelector('.pill-sizes');
  const rows = list ? list.querySelectorAll<HTMLElement>(ITEMS) : [];
  return [...rows].filter(
    (row) => row.closest('[hidden]') === null && row.getClientRects().length > 0,
  );
}

function menuOf(target: EventTarget | null, main: HTMLElement): HTMLDetailsElement | null {
  if (!(target instanceof Element)) return null;
  const menu = target.closest<HTMLDetailsElement>(MENU);
  return menu && main.contains(menu) ? menu : null;
}

export function mountPillMenus(main: HTMLElement): void {
  main.addEventListener('keydown', (event) => {
    const menu = menuOf(event.target, main);
    if (!menu) return;
    if (event.key === 'Escape') {
      if (!menu.open) return;
      event.preventDefault();
      // The shell's own Escape (leave a mode, clear a selection) is not for a menu.
      event.stopPropagation();
      close(menu, true);
      return;
    }
    // The number field keeps its arrows: they step the width.
    if (event.target instanceof HTMLInputElement) return;
    if (!menu.open) {
      if (event.key !== 'ArrowDown') return;
      if (!(event.target instanceof Element) || !event.target.closest('summary')) return;
      event.preventDefault();
      menu.open = true;
      itemsOf(menu)[0]?.focus();
      return;
    }
    const items = itemsOf(menu);
    const active = document.activeElement;
    const at = active instanceof HTMLElement ? items.indexOf(active) : -1;
    const next = stepFocus(items.length, at, event.key);
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  });

  main.addEventListener('click', (event) => {
    // A pick the page handled itself is `defaultPrevented` by now; it closes the menu all the same.
    const plain = isPlainClick({
      button: event.button,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      defaultPrevented: false,
    });
    if (!plain || !(event.target instanceof Element)) return;
    const item = event.target.closest<HTMLElement>(CHOOSE);
    const menu = item ? menuOf(item, main) : null;
    if (!item || !menu?.open) return;
    // The state's name shows in the button at once; the server's fresh markup follows the switch.
    if (item.matches('a[data-state]')) {
      const name = menu.querySelector('.pill-state-name');
      const label = item.querySelector('span')?.textContent;
      if (name && label) name.textContent = label;
    }
    close(menu, true);
  });

  // Tab out of an open menu closes it; a click on its padding does not.
  main.addEventListener('focusout', (event) => {
    const menu = menuOf(event.target, main);
    const next = event.relatedTarget;
    if (menu?.open && next instanceof Node && !menu.contains(next)) menu.open = false;
  });

  // One menu open at a time; `toggle` does not bubble, so it is heard on the way down.
  main.addEventListener(
    'toggle',
    (event) => {
      const menu = menuOf(event.target, main);
      if (!menu?.open) return;
      for (const other of main.querySelectorAll<HTMLDetailsElement>(MENU)) {
        if (other !== menu) other.open = false;
      }
    },
    true,
  );

  document.addEventListener('pointerdown', (event) => {
    for (const menu of main.querySelectorAll<HTMLDetailsElement>(MENU)) {
      if (menu.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    }
  });
}
