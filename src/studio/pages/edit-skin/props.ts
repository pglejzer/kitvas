// The editor's styles: props (plan 13, task G). Base kit tokens only (`pages/skin.ts` rules).

export const EDIT_SKIN_PROPS = `
[data-edit="props"] { margin-top: var(--kit-space-xl); min-width: 0; }
[data-edit="props"] h3 { margin-top: 0; }
[data-edit="props"] h4 { margin-top: var(--kit-space-lg); }
.props-row {
  display: grid;
  grid-template-columns: minmax(5.5rem, 8rem) minmax(0, 1fr);
  gap: var(--kit-space-xs) var(--kit-space-md);
  align-items: center;
  padding: var(--kit-space-xs) 0;
  border-bottom: 1px solid var(--kit-color-line);
}
.props-label {
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
  overflow-wrap: anywhere;
}
.props-body { min-width: 0; }
.props-meta {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-md);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.props-meta:empty { display: none; }
.props-input {
  width: 100%;
  min-height: 24px;
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-bg);
  color: var(--kit-color-ink);
  font: inherit;
}
.props-token { display: grid; gap: var(--kit-space-xs); }
.props-custom { font-family: var(--kit-font-mono); }
.props-custom[aria-invalid="true"] { border-color: var(--kit-color-fix); }
.props-check { width: 1.25rem; height: 1.25rem; margin: 0; }
.props-code { font-size: var(--kit-font-size-sm); overflow-wrap: anywhere; }
.props-note { margin: 0; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
p.props-note { margin-bottom: var(--kit-space-sm); }
.props-problem { color: var(--kit-color-fix); font-size: var(--kit-font-size-sm); }
.props-offkit {
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-review);
  border-radius: var(--kit-radius-sm);
  color: var(--kit-color-review);
}
.props-reset {
  min-height: 24px;
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink-mid);
  font: inherit;
  cursor: pointer;
}
.props-reset:hover { color: var(--kit-color-ink); }
.props-computed { font-family: var(--kit-font-mono); }
`;
