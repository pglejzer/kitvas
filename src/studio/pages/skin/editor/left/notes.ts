// The Notes pane: note cards, the one-line foot that adds one, and the note form (mock v10,
// "notes"). Plan 18, task B; plan 18f, task 1. Studio tokens only (`--st-*`); the card and its
// muted first line are the shared `.k-card` and `.k-card-meta` (`../`).

export const SKIN_EDITOR_NOTES = `
.notes-pane-head > .k-head { min-height: 0; justify-content: flex-start; }
.notes-scroll { padding: 0 0 var(--st-space-12); }
.notes-list { padding: 0; }
.notes-none { padding: var(--st-space-16) var(--st-space-12); }
.notes-head { flex-wrap: nowrap; }
.notes-label {
  flex: none;
  min-width: 24px;
  height: var(--st-size-chip);
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
.notes-text { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.notes-item[data-done] .notes-text { color: var(--st-color-ink-mid); }
/* "Waiting for Claude", "Done": a dot and a quiet line under the words. */
.notes-status {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
}
.notes-actions { display: flex; gap: var(--st-space-2); margin-left: calc(-1 * var(--st-space-6)); }
.notes-action { min-height: 24px; padding: 0 var(--st-space-6); color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); }
.notes-action:hover { color: var(--st-color-ink); }
/* The foot: one line, the field and Add; the choice of who it is for shows while it has focus or
   words, and the field takes more lines then. Nothing above it moves. */
.notes-foot { flex-direction: column; align-items: stretch; justify-content: flex-start; gap: var(--st-space-6); }
.notes-foot-main { display: flex; align-items: flex-start; gap: var(--st-space-8); }
textarea.notes-field {
  flex: 1;
  field-sizing: content;
  min-height: var(--st-size-control);
  max-height: 33vh;
  padding-top: var(--st-space-4);
  padding-bottom: var(--st-space-4);
  line-height: 1.5;
  font-size: inherit;
  resize: none;
}
.notes-foot[data-open] textarea.notes-field { min-height: calc(3 * 1.5em + 2 * var(--st-space-6)); }
.notes-submit { flex: none; }
.notes-foot-more { display: none; align-items: center; justify-content: space-between; gap: var(--st-space-8); }
.notes-foot[data-open] .notes-foot-more { display: flex; flex-wrap: wrap; }
.notes-hint { margin: 0; }
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
