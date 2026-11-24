// The editor's styles: the version timeline under the canvas and the diff dialog of Bring back
// and Restore (plan 17, task D). Base kit tokens only (`pages/skin.ts` rules).
//
// The strip lies along the bottom of the canvas region. While it shows, the page script marks the
// region (`data-has-timeline`), and the scroller and the dock make room for it.

export const EDIT_SKIN_TIMELINE = `
[data-shell="canvas"] { --timeline-height: 2.5rem; }
.timeline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: var(--kit-space-md);
  height: var(--timeline-height);
  padding: 0 var(--kit-space-lg);
  border-top: 1px solid var(--kit-color-line);
  background: var(--kit-color-surface);
  font-size: var(--kit-font-size-sm);
}
.timeline[hidden] { display: none; }
[data-shell="canvas"][data-has-timeline] .canvas-scroll { bottom: var(--timeline-height); }
[data-shell="canvas"][data-has-timeline] .editor-dock {
  bottom: calc(var(--timeline-height) + var(--kit-space-lg));
}
.timeline-track {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  gap: var(--kit-space-xs);
  min-width: 0;
  max-width: 40rem;
  overflow-x: auto;
  user-select: none;
  touch-action: none;
}
.timeline-point {
  flex: none;
  min-width: 24px;
  min-height: 24px;
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-lg);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink-mid);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.timeline-point:hover,
.timeline-point[data-over] { border-color: var(--kit-color-ink); color: var(--kit-color-ink); }
.timeline-point[aria-current="true"] {
  border-color: var(--kit-color-ink);
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
/* The selected element changed in this version; a best-effort match is drawn dashed. */
.timeline-point[data-mark="changed"] { border: 2px solid var(--kit-color-focus); }
.timeline-point[data-mark="unsure"] { border: 2px dashed var(--kit-color-focus); }
.timeline-point[data-mark="absent"] { border-style: dotted; border-color: var(--kit-color-line); }
.timeline-status {
  flex: 0 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--kit-color-ink-mid);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timeline-status:empty { display: none; }
.timeline-action,
.edit-diff-button {
  flex: none;
  min-height: 24px;
  padding: 0 var(--kit-space-md);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
.timeline-action[hidden] { display: none; }
.timeline-action[data-primary],
.edit-diff-button[data-primary] {
  border-color: var(--kit-color-ink);
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
.timeline-action:disabled,
.edit-diff-button:disabled {
  border-color: var(--kit-color-line);
  background: var(--kit-color-bg);
  color: var(--kit-color-ink-mid);
  cursor: default;
}
/* An older version is read only: its cards say so with a dashed frame. */
.canvas-card[data-viewing] .frame-box iframe { border-style: dashed; }

.edit-diff {
  width: min(64rem, calc(100vw - 2 * var(--kit-space-lg)));
  max-height: calc(100vh - 2 * var(--kit-space-2xl));
  padding: 0;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-lg);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
}
.edit-diff[open] { display: flex; flex-direction: column; }
.edit-diff::backdrop { background: var(--kit-color-veil); }
.edit-diff-top {
  display: grid;
  gap: var(--kit-space-xs);
  padding: var(--kit-space-md) var(--kit-space-lg);
  border-bottom: 1px solid var(--kit-color-line);
}
.edit-diff-title { margin: 0; font-size: inherit; }
.edit-diff-file,
.edit-diff-note { margin: 0; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.edit-diff-note[data-blocked] { color: var(--kit-color-fix); }
.edit-diff-rows {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  flex: 1 1 auto;
  align-content: start;
  min-height: 0;
  overflow: auto;
  font-size: var(--kit-font-size-sm);
}
.edit-diff-head {
  position: sticky;
  top: 0;
  padding: var(--kit-space-xs) var(--kit-space-lg);
  border-bottom: 1px solid var(--kit-color-line);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink-mid);
}
.edit-diff-line {
  min-height: 1.5em;
  padding: 0 var(--kit-space-lg);
  border-left: 2px solid transparent;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.edit-diff-line[data-side="current"] { border-left-color: var(--kit-color-line); }
.edit-diff-line[data-changed="old"] {
  border-left-color: var(--kit-color-focus);
  background: var(--kit-color-bg);
}
.edit-diff-line[data-changed="current"] {
  border-left-color: var(--kit-color-review);
  background: var(--kit-color-bg);
}
.edit-diff-line[data-changed="none"] { background: var(--kit-color-bg); }
.edit-diff-foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--kit-space-sm);
  padding: var(--kit-space-md) var(--kit-space-lg);
  border-top: 1px solid var(--kit-color-line);
}
`;
