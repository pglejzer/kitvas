// The editor's styles: the layers tree's search and rows (plan 13, task F). Base kit tokens only
// (`pages/skin.ts` rules). Where the panels sit is the editor screen's skin (`screen.ts`).

export const EDIT_SKIN_LAYOUT = `
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
`;
