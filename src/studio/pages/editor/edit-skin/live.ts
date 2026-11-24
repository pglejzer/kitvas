// The editor's styles: the live checks of stage 4c (plan 16, task C). The Live section above the
// Checks pane, the selected element's live findings and accessibility card above the Properties
// pane (each a block of its own beside its pane, shown with its tab), and the numbered tags,
// drawn as the frames draw them: dashed for a finding to review, filled for one to fix. Base kit
// tokens only (`pages/skin.ts` rules).

export const EDIT_SKIN_LIVE = `
.editor-side > .live,
.editor-side > .live-props {
  flex: none;
  max-height: 45%;
  min-width: 0;
  margin: 0;
  padding: var(--kit-space-md) var(--kit-space-lg);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-wrap: anywhere;
  border-bottom: 1px solid var(--kit-color-line);
}
.editor-side > .live[hidden],
.editor-side > .live-props[hidden],
.editor-side > .live-off { display: none; }
.live-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--kit-space-xs) var(--kit-space-sm);
}
.live-title {
  margin: 0;
  font-size: var(--kit-font-size-sm);
  font-weight: var(--kit-font-weight-medium);
}
.live-status,
.live-none {
  margin: 0;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.live-status:empty { display: none; }
.live-none { margin-top: var(--kit-space-xs); }
.live-groups,
.live-rows { margin: 0; padding: 0; list-style: none; }
.live-group { margin-top: var(--kit-space-sm); }
.live-element {
  display: flex;
  align-items: center;
  gap: var(--kit-space-xs);
  min-width: 0;
  max-width: 100%;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--kit-color-ink);
  font: inherit;
  font-weight: var(--kit-font-weight-medium);
  text-align: left;
  cursor: pointer;
}
.live-element:hover .live-name { text-decoration: underline; }
.live-element:focus-visible { outline: 2px solid var(--kit-color-focus); outline-offset: 2px; }
.live-element-none { color: var(--kit-color-ink-mid); }
.live-name { min-width: 0; overflow-wrap: anywhere; }
.live-label {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border: 2px dashed var(--kit-color-ink);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font-size: var(--kit-font-size-sm);
  font-weight: var(--kit-font-weight-bold);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.live-label[data-tone="fix"] {
  border-style: solid;
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
.live-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--kit-space-sm);
  margin-top: var(--kit-space-xs);
  padding: var(--kit-space-xs) 0 var(--kit-space-xs) var(--kit-space-sm);
  border-left: 2px solid var(--kit-color-review);
}
.live-row[data-tone="fix"] { border-left-color: var(--kit-color-fix); }
.live-row[data-accepted] {
  border-left-color: var(--kit-color-line-strong);
  color: var(--kit-color-ink-mid);
}
.live-row:focus-visible { outline: 2px solid var(--kit-color-focus); outline-offset: 2px; }
.live-message { flex: 1 1 12rem; min-width: 0; }
.live-where { color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.live-subtitle {
  display: flex;
  align-items: center;
  gap: var(--kit-space-xs);
  margin: 0;
  font-size: var(--kit-font-size-sm);
  font-weight: var(--kit-font-weight-medium);
}
.live-here + .a11y-card { margin-top: var(--kit-space-md); }
.a11y-card > summary {
  min-height: 24px;
  font-size: var(--kit-font-size-sm);
  font-weight: var(--kit-font-weight-medium);
  cursor: pointer;
}
.a11y-count { color: var(--kit-color-ink-mid); font-weight: var(--kit-font-weight-regular); }
.a11y-rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--kit-space-xs) var(--kit-space-md);
  margin: var(--kit-space-sm) 0 0;
  font-size: var(--kit-font-size-sm);
}
.a11y-row { display: contents; }
.a11y-row > dt { color: var(--kit-color-ink-mid); }
.a11y-row > dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
/* After the plain rows, so a problem's words stand out. */
.a11y-count[data-problems],
.a11y-row-problem > dt {
  color: var(--kit-color-ink);
  font-weight: var(--kit-font-weight-medium);
}
.a11y-row-problem > dd {
  padding-left: var(--kit-space-xs);
  border-left: 2px solid var(--kit-color-fix);
}
.a11y-link {
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--kit-color-ink);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.a11y-link:focus-visible { outline: 2px solid var(--kit-color-focus); outline-offset: 2px; }
`;
