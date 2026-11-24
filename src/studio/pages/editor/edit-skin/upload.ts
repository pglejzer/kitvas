// Stage 4c (plan 16, task E): image upload and waivers. Base tokens only.
// The drop shield lies over the cards while a file is dragged (a frame never sees such a drag);
// the buttons and the form are the picker's Upload, the Insert tab's box and "Accept…".

export const EDIT_SKIN_UPLOAD = `
.drop-shield {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-items: start center;
  padding-top: var(--kit-space-xl);
  outline: 2px dashed var(--kit-color-focus);
  outline-offset: calc(-1 * var(--kit-space-xs));
}
.drop-shield[hidden] { display: none; }
.drop-hint {
  margin: 0;
  padding: var(--kit-space-xs) var(--kit-space-md);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  pointer-events: none;
}
.upload { display: inline-flex; align-items: center; }
.upload-button,
.waiver-button {
  min-height: 24px;
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
.upload-button:disabled,
.waiver-button:disabled { color: var(--kit-color-ink-mid); cursor: default; }
.upload-box {
  display: grid;
  gap: var(--kit-space-xs);
  justify-items: start;
  margin-top: var(--kit-space-md);
  padding: var(--kit-space-sm);
  border: 1px dashed var(--kit-color-line-strong);
  border-radius: var(--kit-radius-md);
}
.upload-box[data-over] { border-color: var(--kit-color-focus); background: var(--kit-color-bg); }
.upload-hint { margin: 0; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.waiver { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--kit-space-xs) var(--kit-space-sm); }
.waiver-form { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--kit-space-xs) var(--kit-space-sm); }
.waiver-form label { display: inline-flex; align-items: center; gap: var(--kit-space-xs); color: var(--kit-color-ink-mid); }
.waiver-form input {
  min-width: 12rem;
  min-height: 24px;
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
}
.waiver-state { color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.waiver-error { color: var(--kit-color-ink); font-size: var(--kit-font-size-sm); }
.waiver-error:empty { display: none; }
.accepted { margin: var(--kit-space-md) 0 var(--kit-space-xs); color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-md); }
.accepted-note { padding: var(--kit-space-sm) 0; border-bottom: 1px solid var(--kit-color-line); color: var(--kit-color-ink-mid); }
.accepted-reason { margin: var(--kit-space-xs) 0 0; }
li.note[data-waived] { color: var(--kit-color-ink-mid); }
`;
