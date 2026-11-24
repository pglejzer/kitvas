// Stage 4c (plan 16, task B): the Properties header's edit context (where edits go and the state
// bar), the value sources and context actions of the rows, the image row with Upload, and the
// width cards' marks and dock control. Base kit tokens only (`pages/skin.ts` rules).

export const EDIT_SKIN_CONTEXT = `
.ctx-bar {
  display: grid;
  gap: var(--kit-space-xs);
  padding: var(--kit-space-sm) 0;
  border-bottom: 1px solid var(--kit-color-line);
}
.ctx-where {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--kit-space-xs);
  margin: 0;
  font-size: var(--kit-font-size-sm);
}
.ctx-label { color: var(--kit-color-ink-mid); }
.ctx-width { font-weight: var(--kit-font-weight-medium); font-variant-numeric: tabular-nums; }
.ctx-states {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-bg);
}
.ctx-state {
  flex: 1 1 auto;
  min-height: 24px;
  padding: 0 var(--kit-space-sm);
  border: 0;
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink);
  font: inherit;
  font-size: var(--kit-font-size-sm);
  cursor: pointer;
}
.ctx-state:hover:not([aria-pressed="true"]) { background: var(--kit-color-surface); }
.ctx-state[aria-pressed="true"] {
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
  font-weight: var(--kit-font-weight-medium);
}
.ctx-state:focus-visible {
  outline: 2px solid var(--kit-color-focus);
  outline-offset: 1px;
}
.props-source[data-context="here"] {
  color: var(--kit-color-ink);
  font-weight: var(--kit-font-weight-medium);
}
.props-image {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs);
  min-width: 0;
}
.props-image > .props-input { flex: 1 1 8rem; width: auto; }

.card-mark {
  display: none;
  flex: none;
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-focus);
  border-radius: var(--kit-radius-sm);
  color: var(--kit-color-ink);
  line-height: calc(1.5rem - 4px);
}
[data-mode="edit"] .canvas-card[data-editing] .card-mark { display: inline-block; }
[data-mode="edit"] .canvas-card[data-editing] .card-caption { color: var(--kit-color-ink); }
[data-mode="edit"] .canvas-card[data-editing] .frame-box iframe {
  border-color: var(--kit-color-focus);
}
.card-caption .card-name + .card-mark { margin-right: auto; }
.dock-every {
  min-height: 24px;
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.dock-every:hover { background: var(--kit-color-bg); }
.dock-every[hidden] { display: none; }
.dock-every:focus-visible {
  outline: 2px solid var(--kit-color-focus);
  outline-offset: 1px;
}
[data-dock="cards"][data-off] .opt { color: var(--kit-color-ink-mid); cursor: not-allowed; }
`;
