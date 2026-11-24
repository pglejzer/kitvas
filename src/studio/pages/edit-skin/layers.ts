// The editor's styles: the layers tree's new parts (plan 14, task D6): the row line with its eye,
// section rows, hidden rows and the drop marks. Base kit tokens only (`pages/skin.ts` rules).

export const EDIT_SKIN_LAYERS = `
.layers-line { display: flex; align-items: center; gap: var(--kit-space-xs); }
.layers-line > .layers-row { flex: 1; min-width: 0; }
[aria-selected="true"] > .layers-line > .layers-row {
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
[aria-selected="true"] > .layers-line > .layers-row .layers-badge { color: var(--kit-color-on-ink); }
.layers-eye {
  flex: none;
  min-width: 24px;
  min-height: 24px;
  border: 0;
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink-mid);
  font: inherit;
  cursor: pointer;
}
.layers-eye:hover { background: var(--kit-color-bg); color: var(--kit-color-ink); }
[data-hidden] > .layers-line > .layers-row .layers-name {
  color: var(--kit-color-ink-mid);
  text-decoration: line-through;
}
.layers-section { font-weight: 600; }
.layers-dragging { cursor: grabbing; user-select: none; }
.layers-row[data-drop="before"] { box-shadow: inset 0 2px 0 var(--kit-color-ink); }
.layers-row[data-drop="after"] { box-shadow: inset 0 -2px 0 var(--kit-color-ink); }
.layers-row[data-drop="inside"] { box-shadow: inset 0 0 0 2px var(--kit-color-ink); }
.layers-row[data-drop="no"] { cursor: not-allowed; opacity: 0.6; }
`;
