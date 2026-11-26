// The editor bar (plan 18, task A): the shared bar (`.k-bar`) with the mark, "Drafts / title" and
// the version menu at its start, Preview | Edit in the middle, and at its end Claude's status
// (the shared `.k-bar-status`), the session line, undo and redo in Edit (the findings, the notes
// and Compare in Preview), View, More and Save version. Studio tokens only (`--st-*`); shared
// classes are `../` (`k-`).
//
// The menus are `<details>` of plain links, so they work without the script; the list a menu opens
// is a `.k-pop.k-menu`, which rises in each time the menu opens.
//
// From 1024 px up nothing in the bar overlaps or leaves it (spec 6.4, fix 4), in Preview and in
// Edit, by rules on the bar's width (a container query, no script). The two side columns are
// equal, so Preview | Edit sits in the middle on every version and in both modes; the title is cut
// with an ellipsis before anything meets it; that switch and Save version never shrink. As the
// bar narrows, what gives way, in order: the session line, Claude's status words (the dot stays),
// then the words of View, More and Compare (their icons stay). Each mode holds other things at the
// end, so each has its own widths. What gives way is hidden for the eye only: it still names its
// control, and a screen reader still reads the status.

/** What gives way: out of the layout and out of sight, still in the page for assistive technology. */
const AWAY = `position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;`;

export const SKIN_EDITOR_BAR = `
/* In Cards the bar's lower edge is its fill on the canvas ground; in Flush a hairline. */
.bar-editor {
  position: relative;
  z-index: 30;
  border-bottom-color: transparent;
  container: editor-bar / inline-size;
  /* Two equal sides, so Preview | Edit stays in the middle whatever the sides hold. */
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
}
.bar-editor .k-bar-mid { justify-content: center; }
:root[data-panels="flush"] .bar-editor { border-bottom-color: var(--st-color-line); }
.bar-crumb { flex: none; padding: 0 var(--st-space-6); }
.bar-slash { flex: none; color: var(--st-color-ink-mid); }
.bar-title {
  flex: 0 1 auto;
  margin: 0 var(--st-space-4) 0 var(--st-space-2);
  font-size: var(--st-font-size-md);
  font-weight: var(--st-font-weight-bold);
  line-height: var(--st-line-height-tight);
  letter-spacing: 0;
}

/* A menu: its summary is a button, and the list it opens floats under it. */
.bar-menu { position: relative; flex: none; }
.bar-menu > summary { list-style: none; }
.bar-menu > summary::-webkit-details-marker { display: none; }
.bar-menu[open] > summary { background: var(--st-color-raised); color: var(--st-color-ink); }
.bar-list {
  position: absolute;
  top: calc(100% + var(--st-space-6));
  left: 0;
  z-index: 50;
  display: grid;
  gap: var(--st-space-2);
  max-width: 320px;
  max-height: 60vh;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}
.bar-list-end { right: 0; left: auto; }
/* A closed menu's list keeps no finished entrance, so it rises in again when the menu opens. */
.bar-menu:not([open]) > .bar-list { animation: none; }
.bar-list-head { padding: var(--st-space-4) var(--st-space-8) var(--st-space-2); }
.bar-tick { display: inline-flex; margin-left: auto; color: var(--st-color-accent); }
.k-meta + .bar-tick { margin-left: 0; }

/* Preview | Edit. */
.bar-modes { flex: none; }
.bar-modes > button { min-width: 64px; }

/* The end: what Claude does, the session, the actions of the mode shown, then View, More, Save. */
.bar-session {
  max-width: 240px;
  padding: 0 var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.bar-session:empty { display: none; }
.bar-group { display: flex; flex: none; align-items: center; gap: var(--st-space-2); }
[data-mode="edit"] .bar-in-preview, [data-mode="preview"] .bar-in-edit { display: none; }
.bar-sep { margin: 0 var(--st-space-4); }
.bar-save { flex: none; margin-left: var(--st-space-4); }

/* What gives way as the bar narrows (see the head of this file). */
@container editor-bar (max-width: 1319px) {
  .bar-session,
  [data-mode="preview"] .bar-editor .k-bar-status-words {
    ${AWAY}
  }
}
@container editor-bar (max-width: 1179px) {
  [data-mode="preview"] .bar-editor .k-bar-word {
    ${AWAY}
  }
  [data-mode="preview"] .bar-editor .k-btn:has(> .k-bar-word) { padding: 0 var(--st-space-6); }
}
@container editor-bar (max-width: 1179px) {
  [data-mode="edit"] .bar-editor .k-bar-status-words {
    ${AWAY}
  }
}
@container editor-bar (max-width: 979px) {
  .bar-editor .k-bar-word {
    ${AWAY}
  }
  .bar-editor .k-btn:has(> .k-bar-word) { padding: 0 var(--st-space-6); }
}
`;
