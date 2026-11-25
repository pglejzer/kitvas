// The studio's skin, shared rules: the surfaces (ADR 0057). The bar of every page, the panel as
// an island or flush, what floats over a page, and the one filled box a panel may hold.
//
// One level of filled box inside a panel: a panel is the shell, an item in it (\`.k-item\`) is set
// apart by its fill, and anything inside an item by a hairline or space, never by another fill,
// border and shadow together (anti-slop 2.2, 2.5).

export const SKIN_SURFACES = `
/* The bar at the top of every page: start, middle, end. */
.k-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--st-space-12);
  height: var(--st-size-bar);
  padding: 0 var(--st-space-10) 0 var(--st-space-12);
  background: var(--st-color-panel);
  border-bottom: 1px solid var(--st-color-line);
}
.k-bar-start, .k-bar-mid, .k-bar-end {
  display: flex;
  align-items: center;
  gap: var(--st-space-4);
  min-width: 0;
}
.k-bar-end { justify-content: flex-end; }
.k-nav { display: flex; gap: var(--st-space-2); }
.k-nav > a[aria-current="page"] { background: var(--st-color-raised); color: var(--st-color-ink); }
/* A thin divider between groups of controls in a bar or a pill. */
.k-sep { width: 1px; height: 16px; flex: none; background: var(--st-color-line); }
/* A panel. In Cards it is an island on the canvas ground; in Flush it meets the window's edge,
   and the rule that places it draws its hairline. */
.k-island { min-width: 0; min-height: 0; background: var(--st-color-panel); }
:root:not([data-panels="flush"]) .k-island {
  overflow: hidden;
  border-radius: var(--st-radius-lg);
  box-shadow: var(--st-shadow-island);
}
/* What floats over the page: a popover, a pill on the canvas, a menu, a toast. */
.k-pop {
  background: var(--st-color-pop);
  color: var(--st-color-ink);
  border-radius: var(--st-radius-md);
  box-shadow: var(--st-shadow-pop);
}
.k-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-2);
  padding: var(--st-space-2);
}
.k-menu { min-width: 184px; padding: var(--st-space-4); font-size: var(--st-font-size-sm); }
.k-menu-item {
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  width: 100%;
  min-height: var(--st-size-control);
  padding: 0 var(--st-space-8);
  border-radius: var(--st-radius-sm);
  color: var(--st-color-ink);
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
}
.k-menu-item:hover, .k-menu-item[data-active], .k-menu-item[aria-current] {
  background: var(--st-color-raised-strong);
}
.k-menu-item:disabled, .k-menu-item[aria-disabled="true"] { color: var(--st-color-ink-mid); }
.k-menu-item:disabled:hover, .k-menu-item[aria-disabled="true"]:hover { background: none; }
.k-menu-item > .k-kbd, .k-menu-item > .k-meta { margin-left: auto; }
.k-menu-sep { height: 1px; margin: var(--st-space-4); background: var(--st-color-line); }
/* The one filled box inside a panel: a finding, a variant, a note, a reason. */
.k-item {
  display: grid;
  gap: var(--st-space-8);
  padding: var(--st-space-10);
  border-radius: var(--st-radius-md);
  background: var(--st-color-raised);
}
.k-item[aria-current], .k-item[data-on] { box-shadow: inset 0 0 0 1px var(--st-color-accent); }
/* A list of items, or of anything else that stacks with the same gap. */
.k-stack { display: grid; gap: var(--st-space-8); margin: 0; padding: 0; list-style: none; }
.k-rule { margin: 0; border: 0; border-top: 1px solid var(--st-color-line); }
/* The head of a pane or a group: a title, and controls at its end. */
.k-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-8);
  min-height: 36px;
  font-weight: var(--st-font-weight-bold);
}
/* Tabs over panes. */
.k-tabs {
  display: flex;
  gap: var(--st-space-2);
  padding: var(--st-space-6) var(--st-space-8) 0;
  border-bottom: 1px solid var(--st-color-line);
}
.k-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-4);
  min-height: 30px;
  padding: 0 var(--st-space-8);
  color: var(--st-color-ink-mid);
  white-space: nowrap;
}
.k-tab:hover { color: var(--st-color-ink); }
.k-tab[aria-selected="true"] { color: var(--st-color-ink); font-weight: var(--st-font-weight-medium); }
.k-tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  right: var(--st-space-8);
  bottom: -1px;
  left: var(--st-space-8);
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--st-color-accent);
}
/* A group that folds: a button with a chevron, then its rows. */
.k-group { border-top: 1px solid var(--st-color-line); padding: var(--st-space-4) var(--st-space-12) var(--st-space-10); }
.k-group-head {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  width: 100%;
  min-height: 32px;
  font-weight: var(--st-font-weight-bold);
  text-align: left;
}
.k-group-head > .k-icon { color: var(--st-color-ink-mid); transition: rotate var(--st-motion-fast) var(--st-ease-out); }
.k-group-head[aria-expanded="false"] > .k-icon { rotate: -90deg; }
/* A label and its control. */
.k-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
  gap: var(--st-space-8);
  min-height: var(--st-size-row);
}
.k-label { color: var(--st-color-ink-mid); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Nothing here yet: a line that says what to do next. */
.k-empty {
  display: grid;
  gap: var(--st-space-8);
  justify-items: start;
  padding: var(--st-space-24) var(--st-space-16);
  color: var(--st-color-ink-mid);
}
.k-empty > h2, .k-empty > strong { color: var(--st-color-ink); }
/* A short message over the page. */
.k-toast {
  position: fixed;
  bottom: var(--st-space-16);
  left: 50%;
  z-index: 60;
  translate: -50% 0;
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  max-width: min(560px, calc(100vw - var(--st-space-32)));
  padding: var(--st-space-8) var(--st-space-12);
}
/* A dialog (\`<dialog class="k-pop k-dialog">\`). */
.k-dialog {
  width: min(560px, calc(100vw - var(--st-space-32)));
  max-height: calc(100vh - var(--st-space-32));
  padding: var(--st-space-16);
  border: 0;
  overflow: auto;
}
.k-dialog::backdrop { background: var(--st-color-veil); }
/* The row of actions that stays in view at the bottom of a pane. */
.k-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--st-space-8);
  padding: var(--st-space-8) var(--st-space-12);
  border-top: 1px solid var(--st-color-line);
  background: var(--st-color-panel);
}
`;
