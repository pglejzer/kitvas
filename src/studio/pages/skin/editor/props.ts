// Properties: the head (path, name, chips), the groups and their rows.
// Plan 18, task C. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The pane (C8) is a column that never scrolls: the head (`.props-top`) stays in view and the
// rows scroll under it (`.props-scroll`). Every group is a `.k-group`, every row a `.k-row`: a
// 76 px label, the control, and under the control its marks, notes and actions.

export const SKIN_EDITOR_PROPS = `
/* Edit is off: the empty pane says how to start. */
[data-edit="props"][data-empty]:empty::before {
  content: attr(data-empty);
  display: block;
  padding: var(--st-space-24) var(--st-space-16);
  color: var(--st-color-ink-mid);
}
.props-top { flex: none; display: grid; gap: var(--st-space-8); min-width: 0; }
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
.props-jump { display: flex; flex: none; gap: var(--st-space-2); }
.props-file > code { font-size: inherit; }
/* Where edits go: the width as a chip, the state as a segmented control. */
.props-where {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-6) var(--st-space-8);
}
.props-states > button { padding: 0 var(--st-space-6); font-size: var(--st-font-size-sm); }

/* Under the head, before the groups: the suggestion and the notes that hold for every row. */
.props-lead {
  display: grid;
  gap: var(--st-space-8);
  padding: 0 var(--st-space-12) var(--st-space-12);
  overflow-wrap: anywhere;
}
.props-offer { justify-items: start; }
.props-hint { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); }
.props-error { color: var(--st-color-fix); font-size: var(--st-font-size-sm); }

/* A group: the shared fold; its rows with a little air between them. */
.props-block-title { font-size: inherit; }
.props-block-rows { display: grid; gap: var(--st-space-4); padding-top: var(--st-space-2); }

/* A row: the label stays on the control's first line, the marks go under the control. */
.props-entry { align-items: start; row-gap: var(--st-space-2); }
.props-key { line-height: var(--st-size-control); font-size: var(--st-font-size-sm); }
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
/* Meta: where the value comes from, and what the frame computes. */
.props-from, .props-calc { font-size: var(--st-font-size-xs); }
.props-from[data-context="here"] {
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-medium);
}
.props-calc { font-family: var(--st-font-mono); }
/* Reset and the context's actions: small and quiet, under the control. */
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
