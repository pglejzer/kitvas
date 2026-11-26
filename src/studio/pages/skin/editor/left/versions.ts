// Versions, at the bottom of the Layers pane: a thumbnail, the name and the status line.
// Plan 18, task B; plan 18f, task 1 (mock v10, "versions in the left panel"). Studio tokens only
// (`--st-*`); shared classes are `../` (`k-`). The thumbnail's 46 x 30 box is the mock's; no
// shared token holds it.

export const SKIN_EDITOR_VERSIONS = `
[data-timeline] { padding: 0 var(--st-space-6) var(--st-space-8); }
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
  align-items: center;
  gap: var(--st-space-10);
  width: 100%;
  min-width: 0;
  padding: var(--st-space-4) var(--st-space-8);
  border-radius: var(--st-radius-md);
  color: var(--st-color-ink-mid);
  text-align: left;
}
.versions-row:hover { background: var(--st-color-raised); color: var(--st-color-ink); }
.versions-row[aria-current] { background: var(--st-color-raised); color: var(--st-color-ink); }
/* The picture: the check's screenshot cropped to the top; a neutral box where there is none. */
.versions-thumb {
  position: relative;
  flex: none;
  width: 46px;
  height: 30px;
  overflow: hidden;
  border-radius: calc(var(--st-radius-sm) - 2px);
  background: var(--st-color-raised-strong);
  box-shadow: inset 0 0 0 1px var(--st-color-line);
}
.versions-thumb > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
}
/* No picture: two bars where a heading would be, so the box still reads as a page. */
.versions-thumb[data-empty]::before, .versions-thumb[data-empty]::after {
  content: "";
  position: absolute;
  left: var(--st-space-4);
  height: 3px;
  border-radius: 2px;
  background: var(--st-color-line-strong);
}
.versions-thumb[data-empty]::before { top: var(--st-space-6); width: 50%; }
.versions-thumb[data-empty]::after { top: calc(var(--st-space-6) + 6px); width: 80%; }
.versions-row[aria-current] .versions-thumb { box-shadow: 0 0 0 1px var(--st-color-raised), 0 0 0 3px var(--st-color-accent); }
.versions-text { display: grid; flex: 1; min-width: 0; }
.versions-name { font-weight: var(--st-font-weight-medium); }
.versions-line { color: var(--st-color-ink-mid); font-size: var(--st-font-size-xs); }
.versions-mark { flex: none; margin-left: auto; }
/* Bring back and Back to now, at the end of the head while an older version is shown. */
.versions-actions { display: flex; flex: none; align-items: center; gap: var(--st-space-2); }
`;
