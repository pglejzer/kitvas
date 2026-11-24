// The editor screen's skin (plan 15, task A): the fixed window, the top bar, the side panels with
// their tabs, grips and rails, the narrow-window overlays and the list of shortcuts. Base kit
// tokens only (`pages/skin.ts` rules); the plain numbers are layout: the canvas's 320 px, the
// panels' starting widths, the 24 px targets and the 1100 px where the panels start to overlay.
// The script (`client/studio/shell/`) sets `--editor-left` and `--editor-right` and the
// `data-folded` and `data-overlay` marks; without it the page shows Preview's defaults.

export const EDIT_SKIN_SCREEN = `
/* The window holds the screen: only the panes and the canvas scroll, each on its own. */
html:has(> body.screen) { height: 100%; overflow: hidden; }
body.screen {
  height: 100vh;
  height: 100dvh;
  padding: 0;
  overflow: hidden;
}
.draft-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: var(--kit-space-3xl) minmax(0, 1fr);
  grid-template-areas: "bar" "body";
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}
/* A note another part puts straight into the screen floats over the canvas, never in a row. */
.draft-page > .edit-note,
.draft-page > .edit-ask {
  grid-area: body;
  z-index: 30;
  align-self: start;
  justify-self: center;
  max-width: min(var(--kit-size-dialog), calc(100% - 2 * var(--kit-space-lg)));
  margin-top: var(--kit-space-md);
  padding: var(--kit-space-xs) var(--kit-space-md);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
}
.draft-page[data-gripping] { cursor: col-resize; user-select: none; }
.draft-page[data-gripping] iframe { pointer-events: none; }

/* The top bar: the draft on the left, the mode in the centre, the session on the right. */
.editor-bar {
  grid-area: bar;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--kit-space-lg);
  min-width: 0;
  padding: 0 var(--kit-space-lg);
  border-bottom: 1px solid var(--kit-color-line);
  background: var(--kit-color-surface);
  font-size: var(--kit-font-size-sm);
}
.editor-bar [hidden] { display: none; }
.editor-bar-start,
.editor-bar-end {
  display: flex;
  align-items: center;
  gap: var(--kit-space-xs);
  min-width: 0;
}
.editor-bar-end { justify-content: flex-end; }
.editor-bar .mark {
  flex: none;
  margin-right: var(--kit-space-sm);
  padding-right: var(--kit-space-md);
  border-right: 1px solid var(--kit-color-line);
  font-size: var(--kit-font-size-md);
}
.editor-title {
  min-width: 0;
  margin: 0 var(--kit-space-sm) 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow-wrap: normal;
  font-size: var(--kit-font-size-md);
  line-height: var(--kit-line-height-snug);
  letter-spacing: 0;
  font-weight: var(--kit-font-weight-medium);
}
.editor-pick > summary,
.editor-pick-off,
.editor-act,
.editor-help {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--kit-space-xs);
  min-height: var(--kit-size-control-sm);
  padding: 0 var(--kit-space-sm);
  border: 1px solid transparent;
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.editor-pick > summary:hover,
.editor-pick[open] > summary,
.editor-act:hover:not(:disabled),
.editor-help:hover {
  border-color: var(--kit-color-line);
  background: var(--kit-color-bg);
}
.editor-pick-off:disabled,
.editor-act:disabled { color: var(--kit-color-ink-mid); cursor: default; }
.editor-save,
.editor-save:hover:not(:disabled) {
  border-color: var(--kit-color-ink);
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
.editor-save:disabled { border-color: var(--kit-color-line); background: transparent; }
.editor-help {
  justify-content: center;
  min-width: var(--kit-size-control-sm);
  margin-left: var(--kit-space-xs);
  border-color: var(--kit-color-line);
  border-radius: var(--kit-radius-full);
  font-weight: var(--kit-font-weight-medium);
}
.editor-session {
  min-width: 0;
  padding: 0 var(--kit-space-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--kit-color-ink-mid);
}
.editor-pick-icon { color: var(--kit-color-ink-mid); }

/* The version and compare menus: plain links in a details element. */
.editor-pick { position: relative; flex: none; }
.editor-pick > summary { list-style: none; }
.editor-pick > summary::-webkit-details-marker { display: none; }
.editor-pick > summary::after { content: '\\25BE'; color: var(--kit-color-ink-mid); }
.editor-pick-list {
  position: absolute;
  top: calc(100% + var(--kit-space-xs));
  left: 0;
  z-index: 40;
  display: grid;
  min-width: 14rem;
  max-width: 22rem;
  max-height: 60vh;
  margin: 0;
  padding: var(--kit-space-xs);
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
}
.editor-pick-item {
  display: flex;
  align-items: center;
  gap: var(--kit-space-sm);
  min-height: 24px;
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border-radius: var(--kit-radius-sm);
  color: var(--kit-color-ink);
  text-decoration: none;
}
.editor-pick-item:hover { background: var(--kit-color-bg); }
.editor-pick-item[aria-current] { font-weight: var(--kit-font-weight-medium); }
.editor-pick-item[aria-current]::after { content: '\\2713'; margin-left: auto; }
.editor-pick-tag { color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.editor-pick-stop {
  margin-top: var(--kit-space-xs);
  padding-top: var(--kit-space-xs);
  border-top: 1px solid var(--kit-color-line);
}

/* Preview | Edit: one control of two segments; the pressed one is dark. */
.editor-modes {
  display: inline-flex;
  gap: var(--kit-space-xs);
  padding: var(--kit-space-xs);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-bg);
}
.editor-mode {
  min-height: 24px;
  padding: 0 var(--kit-space-md);
  border: 0;
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
.editor-mode:hover:not(:disabled):not([aria-pressed="true"]) { background: var(--kit-color-surface); }
.editor-mode[aria-pressed="true"] {
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
  font-weight: var(--kit-font-weight-medium);
}
.editor-mode:disabled { color: var(--kit-color-ink-mid); cursor: not-allowed; }

/* The body: left panel, grip, canvas, grip, right panel. Each part has its own column, so a
   hidden grip leaves an empty track and nothing moves into it. */
.editor-body {
  grid-area: body;
  position: relative;
  display: grid;
  grid-template-columns: auto auto minmax(320px, 1fr) auto auto;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.editor-side[data-side="left"] { grid-area: 1 / 1; }
.editor-grip[data-grip="left"] { grid-area: 1 / 2; }
.editor-canvas { grid-area: 1 / 3; min-width: 0; min-height: 0; }
.editor-grip[data-grip="right"] { grid-area: 1 / 4; }
.editor-side[data-side="right"] { grid-area: 1 / 5; }
.editor-side {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--kit-color-surface);
}
.editor-side[data-side="left"] {
  width: var(--editor-left, 272px);
  border-right: 1px solid var(--kit-color-line);
}
.editor-side[data-side="right"] {
  width: var(--editor-right, 320px);
  border-left: 1px solid var(--kit-color-line);
}

/* Tabs: they wrap onto a second row in a narrow panel rather than scroll. */
.editor-tabs {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: var(--kit-space-xs);
  padding: 0 var(--kit-space-xs) 0 var(--kit-space-sm);
  border-bottom: 1px solid var(--kit-color-line);
}
.editor-tablist { display: flex; flex: 1 1 auto; flex-wrap: wrap; min-width: 0; }
.editor-tab {
  display: inline-flex;
  align-items: center;
  min-height: var(--kit-size-control);
  margin-bottom: -1px;
  padding: 0 var(--kit-space-sm);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--kit-color-ink-mid);
  font: inherit;
  font-size: var(--kit-font-size-sm);
  white-space: nowrap;
  cursor: pointer;
}
.editor-tab:hover { color: var(--kit-color-ink); }
.editor-tab[aria-selected="true"] {
  border-bottom-color: var(--kit-color-ink);
  color: var(--kit-color-ink);
  font-weight: var(--kit-font-weight-medium);
}
.editor-tab:focus-visible { outline-offset: -2px; }
.editor-fold {
  flex: none;
  min-width: var(--kit-size-control-sm);
  min-height: var(--kit-size-control-sm);
  margin-top: var(--kit-space-xs);
  border: 0;
  border-radius: var(--kit-radius-sm);
  background: transparent;
  color: var(--kit-color-ink-mid);
  font: inherit;
  font-size: var(--kit-font-size-lg);
  line-height: 1;
  cursor: pointer;
}
.editor-fold:hover { background: var(--kit-color-bg); color: var(--kit-color-ink); }

/* Panes: each scrolls in itself, and its content reflows to the panel's width. */
.editor-side [data-edit="conflict"] { flex: none; margin: var(--kit-space-md) var(--kit-space-lg) 0; }
.editor-side > .edit-ask { flex: none; margin: var(--kit-space-md) var(--kit-space-lg) 0; }
.editor-side .editor-pane {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: var(--kit-space-md) var(--kit-space-lg) var(--kit-space-xl);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-wrap: anywhere;
}
.editor-side .editor-pane[hidden] { display: none; }
.editor-side .editor-pane:focus-visible { outline-offset: -2px; }
.editor-pane[data-empty]:empty::before { content: attr(data-empty); color: var(--kit-color-ink-mid); }
.editor-pane-note { color: var(--kit-color-ink-mid); }
.editor-pane input,
.editor-pane select,
.editor-pane textarea { max-width: 100%; }
.editor-pane .palette-groups { max-height: none; overflow: visible; }
.editor-pane .craft-pick { margin: 0; }
.checks-lines {
  margin-bottom: var(--kit-space-lg);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.checks-lines:empty { display: none; }

/* Rails: a folded panel's name on end, and a dot while something is selected. */
.editor-rail {
  display: none;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  gap: var(--kit-space-sm);
  width: 100%;
  padding: var(--kit-space-md) 0;
  border: 0;
  background: transparent;
  color: var(--kit-color-ink-mid);
  font: inherit;
  font-size: var(--kit-font-size-sm);
  cursor: pointer;
}
.editor-rail:hover { background: var(--kit-color-bg); color: var(--kit-color-ink); }
.editor-rail:focus-visible { outline-offset: -2px; }
.editor-rail-name { white-space: nowrap; writing-mode: vertical-rl; }
.editor-rail-dot {
  display: none;
  width: 6px;
  height: 6px;
  border-radius: var(--kit-radius-full);
  background: var(--kit-color-ink);
}
.draft-page[data-selected] .editor-rail-dot { display: block; }

/* Grips: no room of their own; each lies over the edge it moves, a line on hover and focus. */
.editor-grip {
  position: relative;
  z-index: 5;
  width: var(--kit-space-sm);
  margin: 0 calc(-1 * var(--kit-space-xs));
  cursor: col-resize;
  touch-action: none;
}
.editor-grip[hidden] { display: none; }
.editor-grip::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(50% - 1px);
  width: 2px;
}
.editor-grip:hover::before,
.editor-grip:focus-visible::before,
.editor-grip[data-dragging]::before { background: var(--kit-color-ink); }
.editor-grip:focus-visible { outline: none; }

/* A wide window: a folded panel is its rail. */
@media (min-width: 1100px) {
  .editor-side[data-folded] { width: var(--kit-size-control); }
  .editor-side[data-folded] > :not(.editor-rail) { display: none; }
  .editor-side[data-folded] > .editor-rail { display: flex; }
}

/* A narrow window: both panels are rails, and one opens over the canvas. */
@media (max-width: 1099.98px) {
  .editor-body {
    grid-template-columns: var(--kit-size-control) 0 minmax(0, 1fr) 0 var(--kit-size-control);
  }
  .editor-grip[data-grip] { display: none; }
  .editor-side[data-side] { width: var(--kit-size-control); }
  .editor-side:not([data-overlay]) > :not(.editor-rail) { display: none; }
  .editor-side:not([data-overlay]) > .editor-rail { display: flex; }
  .editor-side[data-overlay] {
    grid-column: 1 / -1;
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 20;
    max-width: calc(100% - 2 * var(--kit-size-control));
  }
  .editor-side[data-overlay][data-side="left"] { left: 0; width: var(--editor-left, 272px); }
  .editor-side[data-overlay][data-side="right"] { right: 0; width: var(--editor-right, 320px); }
}

/* The list of shortcuts. */
.editor-shortcuts {
  width: min(var(--kit-size-dialog), calc(100vw - 2 * var(--kit-space-lg)));
  max-height: min(40rem, calc(100vh - 2 * var(--kit-space-2xl)));
  padding: 0;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-lg);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
}
.editor-shortcuts[open] { display: flex; flex-direction: column; }
.editor-shortcuts::backdrop { background: var(--kit-color-veil); }
.editor-shortcuts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--kit-space-md);
  padding: var(--kit-space-md) var(--kit-space-lg);
  border-bottom: 1px solid var(--kit-color-line);
}
.editor-shortcuts-head h2 { margin: 0; }
.editor-shortcuts-search {
  flex: none;
  min-height: var(--kit-size-control-sm);
  margin: var(--kit-space-md) var(--kit-space-lg) 0;
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
}
.editor-shortcuts-list {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 var(--kit-space-lg) var(--kit-space-lg);
  overflow-y: auto;
}
.editor-shortcuts-list h3 {
  margin: var(--kit-space-lg) 0 var(--kit-space-xs);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.editor-shortcuts-rows { margin: 0; padding: 0; list-style: none; }
.editor-shortcuts-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--kit-space-xs) var(--kit-space-md);
  padding: var(--kit-space-xs) 0;
  border-bottom: 1px solid var(--kit-color-line);
}
.editor-shortcuts-keys {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.editor-shortcuts kbd {
  min-width: 24px;
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-bg);
  color: var(--kit-color-ink);
  font-family: var(--kit-font-mono);
  font-size: var(--kit-font-size-sm);
  text-align: center;
}
.editor-shortcuts-none { margin: var(--kit-space-lg) 0 0; color: var(--kit-color-ink-mid); }
`;
