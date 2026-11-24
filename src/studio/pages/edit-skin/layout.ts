// The editor's styles: layout (plan 13, task F). Base kit tokens only (`pages/skin.ts` rules).
// The panel sits under the stage; from 1100 px it is a column on the right edge, and the page
// makes room for it while it is open.

export const EDIT_SKIN_LAYOUT = `
.edit-toggle {
  margin-bottom: var(--kit-space-lg);
  min-height: 24px;
  padding: var(--kit-space-xs) var(--kit-space-lg);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-full);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
.edit-toggle[aria-pressed="true"] {
  background: var(--kit-color-ink);
  border-color: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
.edit-panel {
  grid-column: 1 / -1;
  min-width: 0;
  padding: var(--kit-space-lg);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-lg);
  background: var(--kit-color-surface);
}
.edit-panel[hidden] { display: none; }
.edit-panel section { margin-bottom: var(--kit-space-xl); }
.edit-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--kit-space-sm);
  margin-bottom: var(--kit-space-lg);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.edit-bar button {
  min-height: 24px;
  padding: var(--kit-space-xs) var(--kit-space-md);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
.edit-bar button:disabled {
  border-color: var(--kit-color-line);
  color: var(--kit-color-ink-soft);
  cursor: default;
}
.layers-search {
  width: 100%;
  min-height: 24px;
  margin-bottom: var(--kit-space-sm);
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
}
.layers-tree, .layers-tree ul { margin: 0; padding: 0; list-style: none; }
.layers-tree ul { padding-left: var(--kit-space-lg); }
.layers-tree { max-height: 18rem; overflow: auto; }
.layers-row {
  display: flex;
  align-items: center;
  gap: var(--kit-space-sm);
  width: 100%;
  min-height: 24px;
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border: 0;
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.layers-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.layers-badge { flex: none; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.layers-row:hover, .layers-row[data-hover] { background: var(--kit-color-bg); }
.layers-empty { padding: var(--kit-space-sm); color: var(--kit-color-ink-mid); }
@media (min-width: 1100px) {
  .draft-page:has(.edit-panel:not([hidden])) { padding-right: 24rem; }
  .edit-panel {
    position: fixed;
    top: var(--kit-space-lg);
    right: var(--kit-space-lg);
    bottom: var(--kit-space-lg);
    width: 22rem;
    overflow-y: auto;
  }
}
`;
