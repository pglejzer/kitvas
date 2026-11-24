// The editor's styles: the context menu (plan 14, task D3). Base kit tokens only (`pages/skin.ts`
// rules). The menu is placed with `left` and `top` from the page script, over everything.

export const EDIT_SKIN_MENU = `
[data-edit="menu"] {
  position: fixed;
  z-index: 50;
  display: grid;
  min-width: 14rem;
  max-width: 22rem;
  max-height: 70vh;
  overflow-y: auto;
  padding: var(--kit-space-xs);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
}
[data-edit="menu"][hidden] { display: none; }
.edit-menu-divider {
  width: 100%;
  height: 0;
  margin: var(--kit-space-xs) 0;
  border: 0;
  border-top: 1px solid var(--kit-color-line);
}
.edit-menu-item {
  display: grid;
  gap: var(--kit-space-xs);
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border: 0;
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.edit-menu-item:hover:not([aria-disabled="true"]),
.edit-menu-item:focus-visible:not([aria-disabled="true"]) {
  background: var(--kit-color-bg);
}
.edit-menu-item:focus-visible { outline: 2px solid var(--kit-color-focus); }
.edit-menu-item[aria-disabled="true"] { color: var(--kit-color-ink-mid); cursor: default; }
.edit-menu-reason {
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
`;
