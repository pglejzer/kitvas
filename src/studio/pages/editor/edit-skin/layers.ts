// The editor's styles: the layers tree's new parts (plan 14, task D6): the row line with its eye,
// section rows, hidden rows and the drop marks; and the data lists of stage 4c (plan 16, task D):
// the badge that names the kind of list and the note above the properties. Base kit tokens only
// (`pages/skin.ts` rules).

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
/* The panel never scrolls sideways: long names end in an ellipsis. */
.layers-tree { max-height: none; overflow-x: hidden; }
.layers-line { min-width: 0; }
.layers-row { min-width: 0; overflow: hidden; }
.layers-name { flex: 0 1 auto; }
.layers-kit {
  flex: none;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
  line-height: 1;
}
[aria-selected="true"] > .layers-line > .layers-row .layers-kit { color: var(--kit-color-on-ink); }
.layers-dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--kit-color-review);
}
/* The hide toggle shows on hover and focus, and stays on a row that is hidden. */
.layers-lock {
  display: grid;
  place-items: center;
  flex: none;
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink-mid);
  cursor: pointer;
}
.layers-lock svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.2; }
.layers-lock { opacity: 0; }
.layers-line:hover > .layers-lock,
.layers-line:focus-within > .layers-lock,
.layers-lock:focus-visible,
.layers-lock[aria-pressed="true"] { opacity: 1; }
.layers-lock:hover { background: var(--kit-color-bg); color: var(--kit-color-ink); }
.layers-eye { opacity: 0; }
.layers-line:hover > .layers-eye,
.layers-line:focus-within > .layers-eye,
.layers-eye:focus-visible,
.layers-eye[aria-pressed="true"] { opacity: 1; }
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
/* A read-only list's badge reads quieter than a data list's, whose items can be edited. */
.layers-badge { white-space: nowrap; }
.layers-badge[data-kind="literal"] { font-weight: 600; }
.edit-list {
  margin: 0 0 var(--kit-space-sm);
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-bg);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.edit-list[hidden] { display: none; }
`;
