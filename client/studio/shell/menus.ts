// The top bar's menus (plan 15, task A; plan 18, task A): the version, compare and More menus are
// `<details>` with plain links, so they work without this script. With it, one is open at a time,
// a click outside or into the frame closes them, and a button in a menu (Shortcuts) closes its
// menu before it acts; the screen's Esc closes them through `closeAll`. A state or width switch
// replaces what the menus hold (`draft/dom.ts`), so nothing listens inside them.

export type Menus = {
  /** Closes every open menu, the focus back on its summary when `focus`; `false` if none was open. */
  closeAll(focus: boolean): boolean;
};

const MENU = 'details.bar-menu';

export function mountMenus(main: HTMLElement): Menus {
  const menus = (): HTMLDetailsElement[] => [...main.querySelectorAll<HTMLDetailsElement>(MENU)];
  const open = (): HTMLDetailsElement[] => menus().filter((menu) => menu.open);

  // `toggle` does not bubble; the capture phase on `main` hears it for every menu.
  main.addEventListener(
    'toggle',
    (event) => {
      const menu = event.target;
      if (!(menu instanceof HTMLDetailsElement) || !menu.open) return;
      if (!menu.matches(MENU)) return;
      for (const other of open()) if (other !== menu) other.open = false;
    },
    true,
  );

  // Registered before the shortcuts list's own listener (`shell.ts`), so the list that opens
  // takes the summary as the place the focus goes back to.
  main.addEventListener('click', (event) => {
    const item = event.target instanceof Element ? event.target.closest('button') : null;
    const menu = item?.closest<HTMLDetailsElement>(MENU);
    if (!item || !menu?.open || item.closest('summary')) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
  });

  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target;
      for (const menu of open()) {
        if (!(target instanceof Node && menu.contains(target))) menu.open = false;
      }
    },
    true,
  );
  // A click into the frame never reaches this page; its focus leaves the page instead.
  window.addEventListener('blur', () => {
    for (const menu of open()) menu.open = false;
  });

  return {
    closeAll(focus) {
      const shown = open();
      for (const menu of shown) {
        menu.open = false;
        if (focus) menu.querySelector('summary')?.focus();
      }
      return shown.length > 0;
    },
  };
}
