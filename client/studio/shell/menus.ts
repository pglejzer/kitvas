// The top bar's menus (plan 15, task A): the version and compare pickers are `<details>` with plain
// links, so they work without this script. With it, one is open at a time, and a click outside or
// into the frame closes them; the screen's Esc closes them through `closeAll`. A state or width
// switch replaces what the menus hold (`draft-dom.ts`), so nothing listens inside them.

export type Menus = {
  /** Closes every open menu, the focus back on its summary when `focus`; `false` if none was open. */
  closeAll(focus: boolean): boolean;
};

export function mountMenus(main: HTMLElement): Menus {
  const menus = (): HTMLDetailsElement[] => [
    ...main.querySelectorAll<HTMLDetailsElement>('details.editor-pick'),
  ];
  const open = (): HTMLDetailsElement[] => menus().filter((menu) => menu.open);

  // `toggle` does not bubble; the capture phase on `main` hears it for every menu.
  main.addEventListener(
    'toggle',
    (event) => {
      const menu = event.target;
      if (!(menu instanceof HTMLDetailsElement) || !menu.open) return;
      if (!menu.classList.contains('editor-pick')) return;
      for (const other of open()) if (other !== menu) other.open = false;
    },
    true,
  );

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
