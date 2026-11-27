// The editor body (plan 18, task A; C8): the window that never scrolls, the rail, the two side
// panels with their grips, folds and overlays, and the pane hosts. Studio tokens only (`--st-*`);
// shared classes are `../` (`k-`).
//
// Cards and Flush are the same markup: in Cards the rail and the panels are islands (`.k-island`)
// with the gap around them on the canvas ground; in Flush they meet the edges and each other with
// hairlines. The script (`client/studio/shell/panels.ts`) sets `--side-left` and `--side-right`
// (the open widths) and the `data-folded` and `data-overlay` marks. While a fold moves it marks
// `main[data-moving]`, which alone turns the width transition on (`client/studio/shell/move.ts`):
// a grip's drag, a window resize and the first paint take effect at once.

export const SKIN_EDITOR_BODY = `
/* The window holds the screen: only the panes and the canvas scroll, each on its own. */
html:has(> body.screen) { height: 100%; overflow: hidden; }
body.screen { height: 100vh; height: 100dvh; margin: 0; padding: 0; overflow: hidden; }
.side-screen {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: var(--st-size-bar) minmax(0, 1fr);
  grid-template-areas: "bar" "body";
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}
/* The screen shows once: unseen while it carries the opening mark, which the page script takes off
   when every part is in its place (pages/editor/first-layout.ts). Opacity, so a part that sets
   its own visibility stays unseen too, and a frame is laid out and loads meanwhile. */
.side-screen[data-opening] > * { opacity: 0; }
.side-screen > .bar-editor { grid-area: bar; }
.side-screen > .side-body { grid-area: body; }
.side-screen[data-gripping] { cursor: col-resize; user-select: none; }
.side-screen[data-gripping] iframe { pointer-events: none; }

/* The rail, the left panel, the canvas and the right panel, each in its own column. The gaps are
   the canvas's and the left panel's margins, not the grid's, so a folded left panel leaves one
   gap beside the rail, not two. */
.side-body {
  --side-gap: var(--st-size-gap);
  position: relative;
  display: grid;
  grid-template-columns: var(--st-size-rail) auto minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  padding: var(--side-gap);
  overflow: hidden;
}
:root[data-panels="flush"] .side-body { --side-gap: 0px; }
.side-body > .stage-canvas { grid-row: 1; grid-column: 3; margin: 0 var(--side-gap); }

/* The rail: one button per pane of the left panel, and the fold at its end. In Cards it is an
   island as tall as its buttons; in Flush it runs down the window's edge. */
.rail-nav {
  grid-row: 1;
  grid-column: 1;
  align-self: start;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--st-space-4);
  min-height: 0;
  padding: var(--st-space-6) 0;
}
:root[data-panels="flush"] .rail-nav {
  align-self: stretch;
  border-right: 1px solid var(--st-color-line);
}
.rail-grow { display: none; }
:root[data-panels="flush"] .rail-grow { display: block; flex: 1 1 auto; }
.rail-btn { width: 38px; height: 38px; border-radius: var(--st-radius-md); }
/* The fold says whether the panel is open, but only a pane is the active item. */
.rail-fold[aria-expanded="true"]:not(:hover) { background: none; color: var(--st-color-ink-mid); }

/* The side panels. Their content keeps the open width while a panel folds or opens, so nothing
   in it reflows: the panel clips it. */
.side-panel {
  position: relative;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.side-panel[data-side="left"] {
  grid-column: 2;
  width: var(--side-left, var(--st-size-left));
  margin-left: var(--side-gap);
}
.side-panel[data-side="right"] { grid-column: 4; width: var(--side-right, var(--st-size-right)); }
.side-panel[data-side="left"] > * { width: var(--side-left, var(--st-size-left)); }
.side-panel[data-side="right"] > :not(.side-rail) { width: var(--side-right, var(--st-size-right)); }
.side-panel[data-side="left"][data-folded] { width: 0; margin-left: 0; visibility: hidden; }
.side-panel[data-side="right"][data-folded] { width: var(--st-size-rail); }
.side-panel[data-folded] > :not(.side-rail) { visibility: hidden; }
/* Folding keeps what it hides in view until the move ends; opening shows it at once. */
.side-screen[data-moving] .side-panel {
  transition:
    width var(--st-motion-slow) var(--st-ease-out),
    margin-left var(--st-motion-slow) var(--st-ease-out),
    visibility var(--st-motion-slow);
}
.side-screen[data-moving] .side-panel > * { transition: visibility var(--st-motion-slow); }
:root[data-panels="flush"] .side-panel[data-side="left"] { border-right: 1px solid var(--st-color-line); }
:root[data-panels="flush"] .side-panel[data-side="right"] { border-left: 1px solid var(--st-color-line); }
:root[data-panels="flush"] .side-panel[data-side="left"][data-folded] { border-right-width: 0; }

/* The right panel's head: its tabs, and the fold at the end; one hairline under both. */
.side-head {
  display: flex;
  flex: none;
  align-items: stretch;
  border-bottom: 1px solid var(--st-color-line);
}
/* The tabs stay on one line. In a panel too narrow for them the row scrolls sideways, without
   a bar; the script brings the tab picked into view. */
.side-tabs {
  flex: 1 1 auto;
  flex-wrap: nowrap;
  min-width: 0;
  gap: 0;
  padding-right: var(--st-space-2);
  padding-left: var(--st-space-2);
  border-bottom: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.side-tabs::-webkit-scrollbar { display: none; }
/* Four tabs with their counts and the fold button fit the panel's 312 px: the tabs a little
   tighter than the shared ones, the fold button at the 24 px a pointer target needs. */
.side-tabs > .k-tab { flex: none; padding: 0 var(--st-space-6); }
/* A tab's icon: the set's small size, in the tab's own text colour. */
.side-tabs > .k-tab > .k-icon { width: 14px; height: 14px; color: inherit; }
/* The row clips what is under it, so the line of the tab picked sits on its edge, not below. */
.side-tabs > .k-tab[aria-selected="true"]::after { right: var(--st-space-6); bottom: 0; left: var(--st-space-6); }
.side-fold { align-self: center; width: 24px; height: 24px; margin: 0 var(--st-space-2); }

/* A pane host: a column that fills its panel and never scrolls itself. What it holds is an
   optional head, one \`.k-scroll\` and an optional \`.k-actions\` foot. */
.side-panel > [data-pane] {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.side-panel > [data-pane]:focus-visible { outline-offset: -2px; }
.side-panel > [data-pane][data-empty]:empty::before {
  content: attr(data-empty);
  padding: var(--st-space-16) var(--st-space-12);
  color: var(--st-color-ink-mid);
}
.side-panel > [data-edit="conflict"] { flex: none; }
/* Layers: the tree takes the room, Versions under it at most 40 % of the pane. */
.pane-tree {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
/* As tall as its list, up to 40 % of the pane, and never squeezed by the tree above it: past
   that it scrolls. */
.pane-versions {
  flex: 0 0 auto;
  max-height: 40%;
  min-height: 0;
  overflow: auto;
  border-top: 1px solid var(--st-color-line);
}

/* The rail a folded right panel becomes: its tab's name on end, and a dot while something is
   selected. */
.side-rail {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  display: none;
  flex-direction: column;
  align-items: center;
  gap: var(--st-space-10);
  width: var(--st-size-rail);
  padding: var(--st-space-12) 0;
  background: var(--st-color-panel);
  color: var(--st-color-ink-mid);
}
.side-rail:hover { background: var(--st-color-raised); color: var(--st-color-ink); }
.side-rail:focus-visible { outline-offset: -2px; }
.side-rail-name { font-size: var(--st-font-size-sm); white-space: nowrap; writing-mode: vertical-rl; }
.side-rail-dot {
  display: none;
  width: 6px;
  height: 6px;
  border-radius: var(--st-radius-full);
  background: var(--st-color-accent);
}
.side-screen[data-selected] .side-rail-dot { display: block; }
.side-panel[data-folded] > .side-rail { display: flex; }

/* The grips: no room of their own; each lies over the gap or the hairline it moves. */
.side-grip {
  position: relative;
  z-index: 5;
  grid-row: 1;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
}
.side-grip[data-grip="left"] {
  grid-column: 2;
  justify-self: end;
  margin-right: calc(-4px - var(--side-gap) / 2);
}
.side-grip[data-grip="right"] {
  grid-column: 4;
  justify-self: start;
  margin-left: calc(-4px - var(--side-gap) / 2);
}
.side-grip::before {
  content: "";
  position: absolute;
  top: var(--st-space-12);
  bottom: var(--st-space-12);
  left: calc(50% - 1px);
  width: 2px;
  border-radius: var(--st-radius-full);
}
.side-grip:hover::before { background: var(--st-color-line-strong); }
.side-grip:focus-visible::before, .side-grip[data-dragging]::before { background: var(--st-color-accent); }
.side-grip:focus-visible { outline: none; }

/* A narrow window: the rail stays, the right panel is its rail, and one panel opens over the
   canvas. The columns keep their sizes, so the canvas never moves when an overlay opens. */
@media (max-width: 1099.98px) {
  .side-body { grid-template-columns: var(--st-size-rail) 0 minmax(0, 1fr) var(--st-size-rail); }
  .side-grip[data-grip] { display: none; }
  .side-panel[data-side] > :not(.side-rail) { width: auto; }
  .side-panel[data-side="left"]:not([data-overlay]) { display: none; }
  .side-panel[data-side="right"]:not([data-overlay]) { width: var(--st-size-rail); }
  .side-panel[data-side="right"]:not([data-overlay]) > :not(.side-rail) { visibility: hidden; }
  .side-panel[data-side="right"]:not([data-overlay]) > .side-rail { display: flex; }
  .side-panel[data-overlay][data-side] {
    position: absolute;
    top: var(--side-gap);
    bottom: var(--side-gap);
    z-index: 20;
    margin: 0;
    max-width: calc(100% - 2 * var(--st-size-rail) - 4 * var(--side-gap));
    visibility: visible;
  }
  .side-panel[data-overlay] > :not(.side-rail) { visibility: visible; }
  .side-panel[data-overlay] > .side-rail { display: none; }
  .side-panel[data-overlay][data-side="left"] {
    left: calc(var(--st-size-rail) + 2 * var(--side-gap));
    width: var(--side-left, var(--st-size-left));
  }
  .side-panel[data-overlay][data-side="right"] {
    right: var(--side-gap);
    width: var(--side-right, var(--st-size-right));
  }
}
`;
