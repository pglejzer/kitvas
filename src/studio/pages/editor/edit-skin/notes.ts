// The editor's styles: notes and locks (spec 4d, goals 3 and 4; plan 17, task C). The Notes
// section at the bottom of the AI tab, the note form, and the locks box under the conflict box.
// The form's buttons are the diff dialog's (`timeline.ts`). Base kit tokens only (`pages/skin.ts`
// rules).

export const EDIT_SKIN_NOTES = `
.edit-notes {
  display: grid;
  gap: var(--kit-space-sm);
  min-width: 0;
  margin-top: var(--kit-space-lg);
  padding-top: var(--kit-space-md);
  border-top: 1px solid var(--kit-color-line);
}
.edit-notes-heading { margin: 0; font-size: var(--kit-font-size-md); font-weight: var(--kit-font-weight-medium); }
.edit-notes-none { margin: 0; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.edit-notes-list { display: grid; gap: var(--kit-space-sm); margin: 0; padding: 0; list-style: none; }
.edit-notes-item {
  display: grid;
  gap: var(--kit-space-xs);
  padding: var(--kit-space-sm);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
}
.edit-notes-item[data-selected] { border-color: var(--kit-color-focus); }
.edit-notes-item[data-done] { background: var(--kit-color-bg); color: var(--kit-color-ink-mid); }
.edit-notes-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-sm);
  font-size: var(--kit-font-size-sm);
}
.edit-notes-label {
  min-width: 24px;
  min-height: 24px;
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-ink);
  border-radius: var(--kit-radius-full);
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.edit-notes-label:disabled {
  border-color: var(--kit-color-line-strong);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink-mid);
  cursor: default;
}
.edit-notes-place { min-width: 0; overflow-wrap: anywhere; }
.edit-notes-who { color: var(--kit-color-ink-mid); }
.edit-notes-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.edit-notes-actions,
.edit-locks-actions { display: flex; flex-wrap: wrap; gap: var(--kit-space-xs); }
.edit-notes-action,
.edit-locks-button {
  min-height: 24px;
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  font-size: var(--kit-font-size-sm);
  cursor: pointer;
}
.edit-notes-action:hover,
.edit-locks-button:hover:not(:disabled) { background: var(--kit-color-bg); }
.edit-locks-button[data-primary] {
  border-color: var(--kit-color-ink);
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
.edit-locks-button:disabled { color: var(--kit-color-ink-mid); cursor: default; }

.edit-note-form {
  width: min(28rem, calc(100vw - 2 * var(--kit-space-lg)));
  padding: 0;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-lg);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
}
.edit-note-form::backdrop { background: var(--kit-color-veil); }
.edit-note-body { display: grid; gap: var(--kit-space-sm); margin: 0; padding: var(--kit-space-lg); }
.edit-note-title { margin: 0; font-size: inherit; }
.edit-note-place,
.edit-note-said { margin: 0; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.edit-note-said:empty { display: none; }
.edit-note-text {
  min-height: 6rem;
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  resize: vertical;
}
.edit-note-fors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--kit-space-xs) var(--kit-space-md);
  margin: 0;
  padding: 0;
  border: 0;
}
.edit-note-fors legend { padding: 0; margin-bottom: var(--kit-space-xs); color: var(--kit-color-ink-mid); }
.edit-note-for { display: inline-flex; align-items: center; gap: var(--kit-space-xs); }
.edit-note-foot { display: flex; justify-content: flex-end; gap: var(--kit-space-sm); }

.edit-locks {
  display: grid;
  gap: var(--kit-space-sm);
  margin-top: var(--kit-space-sm);
  padding: var(--kit-space-sm);
  border: 1px solid var(--kit-color-fix);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
  font-size: var(--kit-font-size-sm);
}
.edit-locks[hidden] { display: none; }
.edit-locks-body,
.edit-locks-row { display: grid; gap: var(--kit-space-xs); }
.edit-locks-line { margin: 0; }
.edit-locks-said { margin: 0; color: var(--kit-color-ink-mid); }
.edit-locks-said:empty { display: none; }
.edit-locks-lost { display: grid; gap: var(--kit-space-xs); margin: 0; padding: 0; list-style: none; }
.edit-locks-item { display: flex; flex-wrap: wrap; align-items: center; gap: var(--kit-space-xs); }
.edit-locks-name { flex: 1 1 8rem; min-width: 0; overflow-wrap: anywhere; color: var(--kit-color-ink-mid); }
`;
