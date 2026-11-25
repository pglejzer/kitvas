// The Notes pane: note cards, the field that adds one, and the note form.
// Plan 18, task B. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).

export const SKIN_EDITOR_NOTES = `
.notes-pane-head > .k-head { min-height: 0; justify-content: flex-start; }
.notes-scroll { padding: 0 var(--st-space-12) var(--st-space-12); }
.notes-list { padding: 0; }
.notes-none { padding: var(--st-space-16) 0; }
.notes-head { display: flex; align-items: center; gap: var(--st-space-6); min-width: 0; }
.notes-label {
  flex: none;
  min-width: 24px;
  height: 18px;
  padding: 0 var(--st-space-6);
  border-radius: calc(var(--st-radius-sm) - 2px);
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink);
  font-size: var(--st-font-size-xs);
  font-weight: var(--st-font-weight-medium);
}
.notes-label:disabled { color: var(--st-color-ink-mid); }
.notes-label:not(:disabled):hover { background: var(--st-color-pressed); }
.notes-place { flex: 1; }
.notes-who { flex: none; }
.notes-text { overflow-wrap: anywhere; white-space: pre-wrap; }
.notes-item[data-done] .notes-text { color: var(--st-color-ink-mid); text-decoration: line-through; }
.notes-actions {
  display: flex;
  gap: var(--st-space-2);
  padding-top: var(--st-space-6);
  border-top: 1px solid var(--st-color-line);
}
.notes-action { min-height: 24px; padding: 0 var(--st-space-6); font-size: var(--st-font-size-sm); }
/* The foot: the field that adds a note, who it is for, and Add. */
.notes-foot { flex-direction: column; align-items: stretch; justify-content: flex-start; }
textarea.notes-field {
  field-sizing: content;
  min-height: calc(3 * 1.5em + 2 * var(--st-space-6));
  max-height: 33vh;
  line-height: 1.5;
  font-size: inherit;
  resize: none;
}
.notes-hint { margin: 0; }
.notes-foot-row { display: flex; align-items: center; justify-content: space-between; gap: var(--st-space-8); }
/* The note form. */
.notes-form-body { display: grid; gap: var(--st-space-10); }
.notes-form-text { min-height: 96px; }
/* Beside its element: the script sets the two properties; the dialog leaves the centre. */
.notes-form[data-placed] {
  inset: auto;
  margin: 0;
  left: var(--notes-form-left, 0);
  top: var(--notes-form-top, 0);
}
.notes-form .notes-hint { margin: 0; }
.notes-form-fors {
  display: flex;
  align-items: center;
  gap: var(--st-space-12);
  margin: 0;
  padding: 0;
  border: 0;
}
.notes-form-fors > legend { float: left; margin-right: var(--st-space-12); padding: 0; color: var(--st-color-ink-mid); }
.notes-form-for { display: inline-flex; align-items: center; gap: var(--st-space-6); }
.notes-form-for > input { margin: 0; accent-color: var(--st-color-accent); }
.notes-form-said:empty { display: none; }
.notes-form-foot { display: flex; justify-content: flex-end; gap: var(--st-space-8); }
`;
