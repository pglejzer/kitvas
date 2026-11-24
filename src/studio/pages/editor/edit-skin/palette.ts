// The editor's styles: the insert palette (plan 14, task D5). Base kit tokens only.

export const EDIT_SKIN_PALETTE = `
[data-edit="palette"] h3 { margin: var(--kit-space-sm) 0 var(--kit-space-xs); font-size: var(--kit-font-size-md); font-weight: var(--kit-font-weight-medium); }
.palette-search { width: 100%; min-height: 24px; margin-bottom: var(--kit-space-sm); padding: var(--kit-space-xs) var(--kit-space-sm); border: 1px solid var(--kit-color-line-strong); border-radius: var(--kit-radius-sm); background: var(--kit-color-surface); color: var(--kit-color-ink); font: inherit; }
.palette-groups { max-height: 16rem; overflow: auto; }
.palette-groups ul { list-style: none; margin: 0; padding: 0; }
.palette-item { display: flex; align-items: baseline; gap: var(--kit-space-sm); width: 100%; min-height: 24px; padding: var(--kit-space-xs) var(--kit-space-sm); border: 0; border-radius: var(--kit-radius-sm); background: transparent; color: var(--kit-color-ink); font: inherit; text-align: left; cursor: grab; touch-action: none; }
.palette-item:hover { background: var(--kit-color-bg); }
.palette-item:disabled { color: var(--kit-color-ink-soft); cursor: default; }
.palette-part { padding-left: var(--kit-space-lg); }
.palette-name { flex: none; }
.palette-hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.palette-note, .palette-empty { margin: var(--kit-space-xs) 0 0; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
`;
