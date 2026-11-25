// The Layers pane: search, the tree rows, lock and hide; and the locks box that lives with them.
// Plan 18, task B. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).

export const SKIN_EDITOR_LAYERS = `
.layers-head { display: grid; gap: var(--st-space-8); padding-bottom: var(--st-space-8); }
.layers-head > .k-head { min-height: 0; }
.layers-scroll { padding: 0 var(--st-space-6) var(--st-space-8); }
.layers-tree, .layers-tree ul { margin: 0; padding: 0; list-style: none; }
.layers-line {
  display: flex;
  align-items: center;
  gap: var(--st-space-2);
  min-height: var(--st-size-row);
  padding-left: calc(var(--st-space-4) + var(--layers-depth, 0) * var(--st-space-16));
  padding-right: var(--st-space-4);
  border-radius: var(--st-radius-sm);
}
/* The disclosure chevron before a name; a row without children keeps a spacer of the same width. */
.layers-twist {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--st-radius-sm);
  background: none;
  color: var(--st-color-ink-mid);
}
button.layers-twist:hover:not(:disabled) { background: var(--st-color-raised-strong); color: var(--st-color-ink); }
button.layers-twist:disabled { opacity: 0.5; }
.layers-line:hover, .layers-line:has(.layers-row[data-hover]) { background: var(--st-color-raised); }
.layers-tree li[aria-selected="true"] > .layers-line { background: var(--st-color-accent-soft); }
.layers-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  min-width: 0;
  min-height: var(--st-size-row);
  padding-left: var(--st-space-2);
  border-radius: var(--st-radius-sm);
  color: var(--st-color-ink-mid);
  text-align: left;
}
.layers-line:hover .layers-row, .layers-row[data-hover] { color: var(--st-color-ink); }
.layers-row:focus-visible { outline-offset: -2px; }
/* A section's name is the strong line; so is the selected row's. */
.layers-section { color: var(--st-color-ink); }
.layers-section .layers-name,
.layers-tree li[aria-selected="true"] > .layers-line .layers-name { font-weight: var(--st-font-weight-bold); }
.layers-tree li[aria-selected="true"] > .layers-line .layers-row { color: var(--st-color-ink); }
.layers-kit-wrap { display: inline-flex; flex: none; color: var(--st-color-accent); }
.layers-name { flex: 0 1 auto; min-width: 8ch; }
/* The word "section" after a section's name, muted, at the row's right. */
.layers-kind { flex: none; margin-left: auto; white-space: nowrap; }
.layers-badge { flex: none; margin-left: auto; white-space: nowrap; }
.layers-kind + .layers-badge { margin-left: 0; }
.layers-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: var(--st-radius-full);
  background: var(--st-color-ink-mid);
}
.layers-badge + .layers-dot { margin-left: 0; }
.layers-name + .layers-dot { margin-left: auto; }
.layers-tree li[data-hidden] > .layers-line .layers-name { opacity: 0.5; }
/* Lock and hide: on the line on hover and on focus, and always when on. Until then they take no
   room, so a name has the whole line. */
.layers-line > .k-icon-btn { display: none; width: 24px; height: 24px; }
.layers-line:hover > .k-icon-btn, .layers-line:focus-within > .k-icon-btn,
.layers-line > .k-icon-btn[aria-pressed="true"] { display: inline-grid; }
.layers-line > .k-icon-btn[aria-pressed="true"] { background: none; color: var(--st-color-ink); }
.layers-line > .k-icon-btn[aria-pressed="true"]:hover { background: var(--st-color-raised-strong); }
.layers-row[data-drop="before"] { box-shadow: inset 0 2px 0 var(--st-color-accent); }
.layers-row[data-drop="after"] { box-shadow: inset 0 -2px 0 var(--st-color-accent); }
.layers-row[data-drop="inside"] {
  background: var(--st-color-accent-soft);
  box-shadow: inset 0 0 0 1px var(--st-color-accent);
}
.layers-row[data-drop="no"] { cursor: not-allowed; opacity: 0.5; }
.layers-dragging { cursor: grabbing; user-select: none; }
.layers-empty { padding: var(--st-space-16) var(--st-space-8); }
/* The locks box: what another writer's change did to a locked element. */
.layers-locks { padding: var(--st-space-8) var(--st-space-12) 0; }
.layers-locks-body { display: grid; gap: var(--st-space-8); }
.layers-locks .k-item > .k-btn { justify-self: start; }
.layers-locks-actions { display: flex; flex-wrap: wrap; gap: var(--st-space-4); }
.layers-locks-lost {
  display: grid;
  gap: var(--st-space-4);
  margin: 0;
  padding: var(--st-space-8) 0 0;
  border-top: 1px solid var(--st-color-line);
  list-style: none;
}
.layers-locks-item { display: flex; flex-wrap: wrap; align-items: center; gap: var(--st-space-6); }
.layers-locks-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.layers-locks-said { margin-top: var(--st-space-6); }
.layers-locks-said:empty { display: none; }
`;
