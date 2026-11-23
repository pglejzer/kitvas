// The editor's styles: ask (plan 13, task K). Base kit tokens only (`pages/skin.ts` rules).

export const EDIT_SKIN_ASK = `
.edit-ask {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-sm);
  margin-top: var(--kit-space-sm);
  font-size: var(--kit-font-size-sm);
}
.edit-ask[hidden] { display: none; }
.edit-ask-hint, .edit-ask-status { color: var(--kit-color-ink-mid); }
`;
