// The editor bar (plan 18, task A): the shared bar (`.k-bar`) with "Drafts / title" and the
// version menu at its start, Preview | Edit in the middle, and at its end the listening status,
// the session line, undo and redo in Edit (the findings, the notes and Compare in Preview), View,
// More and Save version. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The menus are `<details>` of plain links, so they work without the script; the list a menu opens
// is a `.k-pop.k-menu`, which rises in each time the menu opens.

export const SKIN_EDITOR_BAR = `
/* In Cards the bar's lower edge is its fill on the canvas ground; in Flush a hairline. */
.bar-editor { position: relative; z-index: 30; border-bottom-color: transparent; }
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
.bar-modes > button { min-width: 64px; }

/* The end: what Claude does, the session, the actions of the mode shown, then View, More, Save.
   In a narrow window the status gives way first: it is cut short, never laid over Preview | Edit. */
.bar-listen {
  display: inline-flex;
  flex: 0 1 auto;
  min-width: 0;
  align-items: center;
  gap: var(--st-space-6);
  padding: 0 var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  white-space: nowrap;
}
.bar-session {
  max-width: 240px;
  padding: 0 var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.bar-listen:empty, .bar-session:empty { display: none; }
.bar-group { display: flex; flex: none; align-items: center; gap: var(--st-space-2); }
[data-mode="edit"] .bar-in-preview, [data-mode="preview"] .bar-in-edit { display: none; }
.bar-sep { margin: 0 var(--st-space-4); }
.bar-save { margin-left: var(--st-space-4); }
`;
