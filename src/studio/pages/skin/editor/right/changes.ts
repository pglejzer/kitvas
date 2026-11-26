// The Changes tab: the filter, the session as a rail of steps, Undo all and Save version.
// Plan 18, task D; plan 18f, task 3 (mock v10: filter 513-518, rail 519-530). Studio tokens only
// (`--st-*`); shared classes are `../` (`k-`): `.k-seg` for the filter, `.k-change` for a change.
//
// The rail is a line with a node per step: a filled dot for the person's, a ring in the accent for
// Claude's, a square for the saved version at its end. A row names the element (its icon and name),
// says when, and for Claude's carries the Claude tag; under it the change as `.k-change` chips
// (`client/studio/edit/history/chip-view.ts`) and Claude's reason. The foot stays in view.

export const SKIN_EDITOR_CHANGES = `
.changes-body { display: grid; gap: var(--st-space-12); align-content: start; }
.changes-filter { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; }
.changes-filter > button { min-width: 0; }
.changes-filter-count { color: var(--st-color-ink-mid); font-weight: var(--st-font-weight-regular); }
.changes-steps { display: grid; gap: var(--st-space-8); }
.changes-rail { margin: 0; padding: 0; list-style: none; }
.changes-step {
  position: relative;
  display: grid;
  gap: var(--st-space-6);
  min-width: 0;
  padding: 0 var(--st-space-2) var(--st-space-16) calc(var(--st-space-24) + var(--st-space-4));
}
.changes-step.k-flash { border-radius: var(--st-radius-sm); }
.changes-step::before {
  content: "";
  position: absolute;
  top: 18px;
  bottom: -2px;
  left: 9px;
  width: 2px;
  border-radius: 2px;
  background: var(--st-color-raised-strong);
}
.changes-step:last-child { padding-bottom: var(--st-space-2); }
.changes-step:last-child::before { display: none; }
.changes-node {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 12px;
  height: 12px;
  border-radius: var(--st-radius-full);
  background: var(--st-color-ink-mid);
  box-shadow: 0 0 0 3px var(--st-color-panel);
}
.changes-step[data-by="claude"] > .changes-node {
  background: var(--st-color-panel);
  box-shadow: inset 0 0 0 2.5px var(--st-color-accent), 0 0 0 3px var(--st-color-panel);
}
.changes-saved > .changes-node {
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: var(--st-color-raised-strong);
  box-shadow: inset 0 0 0 1.5px var(--st-color-line-strong), 0 0 0 3px var(--st-color-panel);
}
.changes-row {
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  min-width: 0;
  min-height: 20px;
}
.changes-element {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-6);
  min-width: 0;
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-medium);
  text-align: left;
}
.changes-element > .k-icon { flex: none; color: var(--st-color-ink-mid); }
.changes-element:hover > .k-clip { text-decoration: underline; text-underline-offset: 3px; }
.changes-element[aria-disabled="true"] { cursor: default; }
.changes-element[aria-disabled="true"]:hover > .k-clip { text-decoration: none; }
.changes-version { color: var(--st-color-ink-mid); font-weight: var(--st-font-weight-medium); }
.changes-by {
  display: inline-flex;
  align-items: center;
  flex: none;
  min-height: var(--st-size-chip);
  padding: 0 var(--st-space-6);
  border-radius: var(--st-radius-full);
  background: var(--st-color-accent-soft);
  color: var(--st-color-ink);
  font-size: var(--st-font-size-xs);
}
.changes-time {
  margin-left: auto;
  flex: none;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
}
.changes-row > .k-icon-btn {
  flex: none;
  width: var(--st-size-target);
  height: var(--st-size-target);
  margin: calc(-1 * var(--st-space-2)) 0;
}
.changes-reason { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); overflow-wrap: anywhere; }
.changes-chips, .changes-flags { display: flex; flex-wrap: wrap; gap: var(--st-space-4) var(--st-space-8); min-width: 0; }
.changes-chips > * { max-width: 100%; }
/* The tab's count is drawn empty by the page: it keeps room for one digit, so the tabs stay put. */
.k-tab > .k-count[data-tab-count] { min-width: 1ch; text-align: center; }
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
