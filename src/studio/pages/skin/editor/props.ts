// Properties: the head (path, the element, the scope row), the groups and their rows, and the
// Source strip at the foot. Plan 18, task C; plan 18f, task 2 (mock v10, spec S4.6). Studio tokens
// only (`--st-*`); shared classes are `../` (`k-`).
//
// The pane (C8) is a column that never scrolls: the head (`.props-top`) stays in view, the rows
// scroll under it (`.props-scroll`) and the Source strip (`.props-foot`) stays under them. Every
// group is a `.k-group`, every row a `.k-row`: the label column, the control, and under the
// control its marks and actions. The side padding is the pane's (`--st-space-14`).

export const SKIN_EDITOR_PROPS = `
/* Edit is off: the empty pane says how to start. */
[data-edit="props"][data-empty]:empty::before {
  content: attr(data-empty);
  display: block;
  padding: var(--st-space-24) var(--st-space-16);
  color: var(--st-color-ink-mid);
}
/* A redraw must not move the scroll: the browser's scroll anchoring moved it by a row or two. */
.props-scroll { overflow-anchor: none; }
.props-top {
  flex: none;
  display: grid;
  gap: var(--st-space-10);
  min-width: 0;
  padding: var(--st-space-12) var(--st-space-14) var(--st-space-12);
}
.props-element { display: grid; gap: var(--st-space-2); min-width: 0; }
/* The parents, one quiet line: the nearest stays whole, the outer ones are clipped to share what
   is left. The line keeps room around its crumbs, so the focus ring of one is never cut off. */
.props-path {
  display: flex;
  min-width: 0;
  margin: calc(var(--st-space-4) * -1);
  padding: var(--st-space-4);
  overflow: hidden;
  white-space: nowrap;
}
.props-path-step {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.props-path-step:last-child { flex-shrink: 0; max-width: 100%; }
.props-path-step + .props-path-step::before {
  content: "\\203A";
  padding: 0 var(--st-space-4);
  color: var(--st-color-ink-mid);
}
.props-path-step:hover { color: var(--st-color-ink); }
.props-ident { display: flex; align-items: center; gap: var(--st-space-8); min-width: 0; }
.props-tag { min-width: 0; font-size: var(--st-font-size-lg); }
.props-kind { flex: none; font-weight: var(--st-font-weight-regular); }
/* The kit's mark before a kit component's name: the selected element, so in the accent. */
.props-kit-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: var(--st-size-control);
  height: var(--st-size-control);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-accent-soft);
  color: var(--st-color-accent);
}
/* What explains the element as a whole: its words are the tooltip. */
.props-info {
  display: inline-grid;
  place-items: center;
  flex: none;
  color: var(--st-color-ink-mid);
  cursor: help;
}
.props-jump { display: flex; flex: none; gap: var(--st-space-2); }
/* The scope row: the width as a chip, the state as a segmented control; the list scope under it. */
.props-where {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-6) var(--st-space-8);
}
.props-states > button { padding: 0 var(--st-space-8); font-size: var(--st-font-size-sm); }
.props-scope { justify-self: start; }
.props-scope > button { padding: 0 var(--st-space-8); font-size: var(--st-font-size-sm); }

/* Under the head, before the groups: the suggestion and the notes that hold for every row. */
.props-lead {
  display: grid;
  gap: var(--st-space-8);
  padding: 0 var(--st-space-14) var(--st-space-12);
  overflow-wrap: anywhere;
}
.props-offer { justify-items: start; }
.props-hint { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); }
.props-error { color: var(--st-color-fix); font-size: var(--st-font-size-sm); }

/* A group: the shared fold; its rows with a little air between them. */
.props-block-title { font-size: inherit; }
.props-block-rows { display: grid; gap: var(--st-space-4); padding-top: var(--st-space-2); }
/* A fold inside a group ("All layout properties"): a quieter header over its rows. */
.props-subfold { display: grid; margin-top: var(--st-space-4); }
.props-subfold-head {
  min-height: var(--st-size-row);
  color: var(--st-color-ink-mid);
  font-weight: var(--st-font-weight-regular);
}
.props-subfold-head:hover { color: var(--st-color-ink); }
/* A status on a group's header (Accessibility's problems) stays seen while the group is folded. */
.k-group-head > .props-a11y-chip { margin-left: auto; font-weight: var(--st-font-weight-regular); }

/* A row: the label stays on the control's first line, the marks go under the control. */
.props-entry { align-items: start; row-gap: var(--st-space-2); }
.props-key { line-height: var(--st-size-control); }
.props-control {
  display: grid;
  align-items: center;
  min-width: 0;
  min-height: var(--st-size-control);
}
.props-extra {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-2) var(--st-space-8);
  min-width: 0;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  overflow-wrap: anywhere;
}
.props-extra:empty { display: none; }
/* A stepper takes the row's width under its label; a row without a label takes it whole. */
.props-entry[data-wide], .props-entry[data-bare] { grid-template-columns: minmax(0, 1fr); }
.props-entry[data-wide] > .props-extra, .props-entry[data-bare] > .props-extra { grid-column: 1; }
.props-entry[data-wide] > .props-key { line-height: var(--st-line-height-normal); }
/* In a width or a state: where the value comes from, a short status. */
.props-from { font-size: var(--st-font-size-xs); }
.props-from[data-context="here"] {
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-medium);
}
/* Reset, Custom, "Use <token>" and the context's actions: small and quiet, under the control. */
.props-act {
  min-height: var(--st-size-target);
  padding: 0 var(--st-space-6);
  font-size: var(--st-font-size-sm);
}
/* Drag the label of a number row to step through the kit's scale; the value shows over it. */
.props-scrubber { position: relative; cursor: ew-resize; user-select: none; touch-action: none; }
.props-scrubber:hover { color: var(--st-color-ink); }
.props-scrubber[data-scrub]::after {
  content: attr(data-scrub);
  position: absolute;
  inset: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--st-color-panel);
  color: var(--st-color-ink);
  font-family: var(--st-font-mono);
}

/* Accessibility: a label and a value per fact, a problem in the fix tone. */
.props-a11y { display: grid; gap: var(--st-space-4); margin: 0; }
.props-a11y-row > dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--st-font-size-sm);
}
.props-a11y-link { font-size: var(--st-font-size-sm); }

/* The Source strip: in view under the rows, read only; a place copies its path and line. */
.props-foot { flex: none; min-width: 0; }
.props-source {
  display: grid;
  gap: var(--st-space-2);
  min-width: 0;
  padding: var(--st-space-6) var(--st-space-14) var(--st-space-10);
  border-top: 1px solid var(--st-color-line);
  background: var(--st-color-panel);
  color: var(--st-color-ink-mid);
  font-family: var(--st-font-mono);
  font-size: var(--st-font-size-xs);
}
.props-source-head, .props-source-rule {
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  min-width: 0;
}
.props-source-head { justify-content: space-between; font-family: var(--st-font-body); }
.props-source-copy {
  flex: none;
  min-height: var(--st-size-target);
  padding: 0 var(--st-space-4);
  border-radius: calc(var(--st-radius-sm) - 2px);
  color: var(--st-color-ink-mid);
  font: inherit;
}
.props-source-copy:hover { background: var(--st-color-raised); color: var(--st-color-ink); }
.props-source-copy[data-done] { color: var(--st-color-good); }
.props-source-tag { display: block; color: var(--st-color-ink); font-size: inherit; }
.props-source-class { font-size: inherit; }

/* What the items of a data list are, in a block of its own above the properties (drawn beside
   them, as their pane draws itself again). */
.side-panel > .list-note[data-pane] {
  display: block;
  flex: none;
  margin: 0;
  padding: var(--st-space-8) var(--st-space-12);
  border-bottom: 1px solid var(--st-color-line);
  overflow: visible;
  overflow-wrap: anywhere;
}
.side-panel > .list-note[data-off] { display: none; }
`;
