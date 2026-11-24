// The Changes tab: the session as a rail of steps, Undo all and Save version.
// Plan 18, task D. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The rail is a line with a node per step: a filled dot for the person's, a ring for Claude's (the
// accent is kept for the selection), a square for the saved version at its end. What a step
// changed is a row of chips (`client/studio/edit/history/chip-view.ts`); the foot stays in view.

export const SKIN_EDITOR_CHANGES = `
.changes-body { display: grid; gap: var(--st-space-16); align-content: start; }
.changes-steps { display: grid; gap: var(--st-space-8); }
.changes-rail { margin: 0; padding: 0; list-style: none; }
.changes-step {
  position: relative;
  display: grid;
  gap: var(--st-space-4);
  min-width: 0;
  padding: 0 0 var(--st-space-16) var(--st-space-24);
}
.changes-step.k-flash { border-radius: var(--st-radius-sm); }
.changes-step::before {
  content: "";
  position: absolute;
  top: 20px;
  bottom: 0;
  left: 7px;
  width: 2px;
  border-radius: 2px;
  background: var(--st-color-raised-strong);
}
.changes-step:last-child { padding-bottom: 0; }
.changes-step:last-child::before { display: none; }
.changes-node {
  position: absolute;
  top: 6px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: var(--st-radius-full);
  background: var(--st-color-ink-mid);
  box-shadow: 0 0 0 3px var(--st-color-panel);
}
.changes-step[data-by="claude"] > .changes-node {
  background: var(--st-color-panel);
  box-shadow: inset 0 0 0 2px var(--st-color-ink-mid), 0 0 0 3px var(--st-color-panel);
}
.changes-saved > .changes-node {
  top: 4px;
  left: 0;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: var(--st-color-raised-strong);
  box-shadow: inset 0 0 0 1px var(--st-color-line-strong), 0 0 0 3px var(--st-color-panel);
}
.changes-row {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  min-width: 0;
  min-height: var(--st-size-target);
}
.changes-element {
  min-width: 0;
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-medium);
  text-align: left;
}
.changes-element:hover { text-decoration: underline; text-underline-offset: 3px; }
.changes-element[aria-disabled="true"] { cursor: default; }
.changes-element[aria-disabled="true"]:hover { text-decoration: none; }
.changes-row > .k-icon-btn {
  width: var(--st-size-target);
  height: var(--st-size-target);
  margin-left: auto;
}
.changes-label { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); overflow-wrap: anywhere; }
.changes-chips { display: flex; flex-wrap: wrap; gap: var(--st-space-4); min-width: 0; }
.changes-chip { max-width: 100%; }
.changes-chip > .k-icon { width: 12px; height: 12px; color: var(--st-color-ink-mid); }
.changes-chip-name { color: var(--st-color-ink-mid); }
.changes-chip-before { color: var(--st-color-ink-mid); }
.changes-chip-after { color: var(--st-color-ink); font-weight: var(--st-font-weight-medium); }
.changes-chip > span, .changes-chip > s { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* The values outside the kit, under the rail. */
.changes-offkit {
  display: grid;
  gap: var(--st-space-8);
  padding-top: var(--st-space-12);
  border-top: 1px solid var(--st-color-line);
}
.changes-offkit-title {
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  font-weight: var(--st-font-weight-medium);
}
.changes-offkit-item { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.changes-offkit-what {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--st-space-2) var(--st-space-8);
  min-width: 0;
  color: var(--st-color-ink-mid);
}
.changes-offkit-what > code { overflow-wrap: anywhere; }
.changes-offkit-value { color: var(--st-color-ink); }
/* The foot: how much is not saved yet, Undo all and Save version, always in view. */
.changes-foot { flex: none; }
.changes-foot-note { margin-right: auto; min-width: 0; }
`;
