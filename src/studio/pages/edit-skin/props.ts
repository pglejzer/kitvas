// The editor's styles: the properties panel (plan 13, task G; plan 15, task C): the header, the
// folding groups, the rows, the box model, segmented keywords and raw lengths. Base kit tokens
// only (`pages/skin.ts` rules). Rows wrap their controls; nothing scrolls sideways.

export const EDIT_SKIN_PROPS = `
[data-edit="props"] { min-width: 0; overflow-wrap: anywhere; }
[data-edit="props"] h3 { margin: 0; }
.props-head {
  display: grid;
  gap: var(--kit-space-xs);
  padding-bottom: var(--kit-space-sm);
  border-bottom: 1px solid var(--kit-color-line);
}
.props-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--kit-space-sm); }
.props-name { font-size: var(--kit-font-size-md); min-width: 0; overflow-wrap: anywhere; }
.props-chip {
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.props-place {
  margin: 0;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
  overflow-wrap: anywhere;
}
.props-crumbs { display: flex; flex-wrap: wrap; gap: var(--kit-space-xs); }
.props-crumb + .props-crumb::before {
  content: "\\203A";
  margin-right: var(--kit-space-xs);
  color: var(--kit-color-ink-mid);
}
.props-crumb, .props-nav-button, .props-fold, .props-seg-item, .props-box-side {
  min-height: 24px;
  border: 0;
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
.props-crumb {
  padding: 0 var(--kit-space-xs);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.props-crumb:hover, .props-crumb:focus-visible { color: var(--kit-color-ink); }
.props-nav { display: flex; flex-wrap: wrap; gap: var(--kit-space-xs); }
.props-nav-button {
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line);
  font-size: var(--kit-font-size-sm);
}
.props-nav-button:disabled { color: var(--kit-color-ink-mid); cursor: default; }
.props-group { border-bottom: 1px solid var(--kit-color-line); }
.props-group-head { margin: 0; }
.props-fold {
  display: flex;
  width: 100%;
  align-items: center;
  gap: var(--kit-space-xs);
  padding: var(--kit-space-sm) 0;
  font-weight: var(--kit-font-weight-medium);
  text-align: left;
}
.props-fold::before { content: "\\25BE"; color: var(--kit-color-ink-mid); }
.props-fold[aria-expanded="false"]::before { content: "\\25B8"; }
.props-group-body { padding-bottom: var(--kit-space-sm); }
.props-row {
  display: grid;
  grid-template-columns: minmax(5.5rem, 8rem) minmax(0, 1fr);
  gap: var(--kit-space-xs) var(--kit-space-md);
  align-items: center;
  padding: var(--kit-space-xs) 0;
}
.props-row + .props-row { border-top: 1px solid var(--kit-color-line); }
.props-label {
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
  overflow-wrap: anywhere;
}
.props-scrub { cursor: ew-resize; user-select: none; touch-action: none; }
.props-scrub[data-scrub]::after {
  content: " " attr(data-scrub);
  color: var(--kit-color-ink);
  font-family: var(--kit-font-mono);
}
.props-body { min-width: 0; }
.props-meta {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-md);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.props-meta:empty { display: none; }
.props-input {
  width: 100%;
  min-width: 0;
  min-height: 24px;
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-bg);
  color: var(--kit-color-ink);
  font: inherit;
}
.props-token { display: grid; gap: var(--kit-space-xs); min-width: 0; }
.props-length { display: flex; flex-wrap: wrap; gap: var(--kit-space-xs); min-width: 0; }
.props-length[hidden] { display: none; }
.props-length .props-custom { flex: 1 1 4rem; width: auto; }
.props-unit { flex: 0 0 auto; width: auto; }
.props-custom { font-family: var(--kit-font-mono); }
.props-custom[aria-invalid="true"] { border-color: var(--kit-color-fix); }
.props-seg {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
}
.props-seg-item {
  flex: 1 1 auto;
  padding: 0 var(--kit-space-sm);
  font-size: var(--kit-font-size-sm);
  font-family: var(--kit-font-mono);
}
.props-seg-item:hover { background: var(--kit-color-surface); }
.props-seg-item[aria-pressed="true"] {
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
.props-seg-item[data-computed] { outline: 1px dashed var(--kit-color-line); outline-offset: -2px; }
.props-check { width: 1.25rem; height: 1.25rem; margin: 0; }
.props-code { font-size: var(--kit-font-size-sm); overflow-wrap: anywhere; }
.props-note { margin: 0; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
p.props-note { margin: var(--kit-space-xs) 0; }
.props-problem { color: var(--kit-color-fix); font-size: var(--kit-font-size-sm); }
.props-offkit {
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-review);
  border-radius: var(--kit-radius-sm);
  color: var(--kit-color-review);
}
.props-reset {
  min-height: 24px;
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink-mid);
  font: inherit;
  cursor: pointer;
}
.props-reset:hover { color: var(--kit-color-ink); }
.props-computed { font-family: var(--kit-font-mono); }
.props-box { display: grid; gap: var(--kit-space-sm); padding: var(--kit-space-xs) 0; }
.props-box-margin, .props-box-padding {
  display: grid;
  grid-template-columns: minmax(2rem, auto) minmax(0, 1fr) minmax(2rem, auto);
  grid-template-areas: "name top ." "left core right" ". bottom .";
  align-items: center;
  justify-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px dashed var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
}
.props-box-padding { border-style: solid; background: var(--kit-color-surface); }
.props-box-name {
  grid-area: name;
  justify-self: start;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.props-box-side {
  min-width: 2rem;
  padding: 0 var(--kit-space-xs);
  font-size: var(--kit-font-size-sm);
  font-family: var(--kit-font-mono);
}
.props-box-side[data-side="top"] { grid-area: top; }
.props-box-side[data-side="right"] { grid-area: right; }
.props-box-side[data-side="bottom"] { grid-area: bottom; }
.props-box-side[data-side="left"] { grid-area: left; }
.props-box-side:hover { background: var(--kit-color-bg); }
.props-box-side[aria-pressed="true"] {
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
.props-box-margin > .props-box-padding { grid-area: core; width: 100%; }
.props-box-core {
  grid-area: core;
  width: 100%;
  min-height: 1.5rem;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-bg);
}
.props-crumb:focus-visible, .props-nav-button:focus-visible, .props-fold:focus-visible,
.props-seg-item:focus-visible, .props-box-side:focus-visible, .props-scrub:focus-visible {
  outline: 2px solid var(--kit-color-focus);
  outline-offset: 1px;
}
`;
