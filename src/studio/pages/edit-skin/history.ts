// The editor's styles: history and the conflict choice (plan 13, task H). Base kit tokens only
// (`pages/skin.ts` rules).

export const EDIT_SKIN_HISTORY = `
[data-edit="conflict"] {
  display: grid;
  gap: var(--kit-space-sm);
  padding: var(--kit-space-md);
  border: 1px solid var(--kit-color-review);
  border-radius: var(--kit-radius-md);
}
[data-edit="conflict"][hidden] { display: none; }
[data-edit="conflict"] [data-conflict-body] { display: grid; gap: var(--kit-space-xs); }
[data-edit="conflict"] p { margin: 0; color: var(--kit-color-ink-mid); }
[data-edit="conflict"] .edit-conflict-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--kit-space-sm);
}
`;
