// The editor's styles: zoom and pan of the stage (spec 4b, decision 13; plan 14, task D7). Base kit
// tokens only (`pages/skin.ts` rules). The frame box itself is scaled by the script; here is only
// the control strip and the stage's scrolling and pan cursor.

export const EDIT_SKIN_ZOOM = `
[data-edit="zoom"] {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs);
  margin-bottom: var(--kit-space-lg);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
[data-edit="zoom"] .zoom-label { margin-right: var(--kit-space-sm); }
[data-edit="zoom"] button {
  min-height: 24px;
  min-width: 24px;
  padding: var(--kit-space-xs) var(--kit-space-md);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
[data-edit="zoom"] button:disabled {
  border-color: var(--kit-color-line);
  color: var(--kit-color-ink-soft);
  cursor: default;
}
[data-edit="zoom"] .zoom-note { flex-basis: 100%; margin: 0; color: var(--kit-color-ink-mid); }
.stage[data-zoomed] { overflow: auto; }
.stage[data-pan] { cursor: grab; }
.stage[data-pan] iframe { pointer-events: none; }
.stage[data-panning] { cursor: grabbing; user-select: none; }
`;
