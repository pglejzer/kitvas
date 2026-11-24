// Versions, at the bottom of the Layers pane.
// Plan 18, task B. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).

export const SKIN_EDITOR_VERSIONS = `
[data-timeline] { padding: 0 var(--st-space-6) var(--st-space-6); }
.versions-head {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 36px;
  padding: 0 var(--st-space-8);
  background: var(--st-color-panel);
}
.versions-list { display: grid; gap: var(--st-space-2); }
.versions-row {
  display: flex;
  align-items: baseline;
  gap: var(--st-space-8);
  width: 100%;
  min-height: var(--st-size-row);
  padding: var(--st-space-4) var(--st-space-8);
  border-radius: var(--st-radius-sm);
  color: var(--st-color-ink-mid);
  text-align: left;
}
.versions-row:hover { background: var(--st-color-raised); color: var(--st-color-ink); }
.versions-row[aria-current] { background: var(--st-color-raised); color: var(--st-color-ink); }
.versions-name { font-weight: var(--st-font-weight-medium); }
.versions-mark { align-self: center; margin-left: auto; }
.versions-status { padding: var(--st-space-6) var(--st-space-8) 0; }
.versions-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--st-space-6);
  padding: var(--st-space-8) var(--st-space-8) 0;
}
`;
