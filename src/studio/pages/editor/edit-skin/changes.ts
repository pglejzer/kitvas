// The editor's styles: changes (plan 13, task J). Base kit tokens only (`pages/skin.ts` rules).

export const EDIT_SKIN_CHANGES = `
[data-edit="changes"] h3 { margin: 0 0 var(--kit-space-xs); font-size: var(--kit-font-size-md); font-weight: var(--kit-font-weight-medium); }
[data-edit="changes"] ol, [data-edit="changes"] ul { list-style: none; margin: 0; padding: 0; }
[data-edit="changes"] .edit-change { display: flex; flex-wrap: wrap; gap: var(--kit-space-xs); width: 100%; padding: var(--kit-space-xs) var(--kit-space-sm); border: 0; border-radius: var(--kit-radius-sm); background: transparent; color: var(--kit-color-ink); font: inherit; text-align: left; cursor: pointer; }
[data-edit="changes"] .edit-change:hover { background: var(--kit-color-line); }
[data-edit="changes"] .edit-change[aria-disabled="true"] { cursor: default; }
[data-edit="changes"] .edit-change-who { color: var(--kit-color-ink-mid); }
[data-edit="changes"] .edit-change-element { font-family: var(--kit-font-mono); }
[data-edit="changes"] .edit-change-flag { color: var(--kit-color-review); }
[data-edit="changes"] .edit-empty { color: var(--kit-color-ink-mid); margin: 0; }
[data-edit="changes"] .edit-offkit { margin-top: var(--kit-space-sm); padding-top: var(--kit-space-sm); border-top: 1px solid var(--kit-color-line); }
[data-edit="changes"] .edit-offkit-item { display: flex; flex-wrap: wrap; align-items: center; gap: var(--kit-space-xs); padding: var(--kit-space-xs) 0; }
[data-edit="changes"] .edit-offkit-value { font-family: var(--kit-font-mono); }
[data-edit="changes"] .edit-offkit-item button { margin-left: auto; }
`;
