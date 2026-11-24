// The Checks tab: the filter of counts and a card per finding.
// Plan 18, task D. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The pane holds what the checks could not do (`.checks-lines`), then the full check's findings
// (`src/studio/pages/draft/notes.ts`): the filter, and under it the list that scrolls. The live
// checks of the session sit in a block of their own above the pane (`.checks-live`), and the
// selected element's above Properties (`.checks-here`, with the accessibility card). A finding's
// tone is its number or its dot, never the colour of its card.

export const SKIN_EDITOR_CHECKS = `
.checks-lines {
  flex: none;
  display: grid;
  gap: var(--st-space-2);
  padding: var(--st-space-12) var(--st-space-12) 0;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.checks-lines:empty { display: none; }
.checks-notes { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.checks-head { flex: none; padding-bottom: 0; }
/* The filter: four equal parts, the count over its word. */
.checks-filter { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); width: 100%; }
.checks-filter > button {
  display: grid;
  justify-items: start;
  align-content: center;
  gap: 0;
  min-height: 40px;
  padding: var(--st-space-4) var(--st-space-8);
  text-align: left;
  white-space: normal;
}
.checks-filter > button > span { font-size: var(--st-font-size-sm); }
.checks-filter-count {
  color: var(--st-color-ink);
  font-size: var(--st-font-size-lg);
  font-weight: var(--st-font-weight-bold);
  line-height: var(--st-line-height-tight);
}
.checks-list { display: grid; gap: var(--st-space-16); align-content: start; }
.checks-group { display: grid; gap: var(--st-space-8); }
.checks-group-title {
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  font-weight: var(--st-font-weight-medium);
}
[data-checks-show="fix"] [data-checks-group]:not([data-checks-group="fix"]),
[data-checks-show="review"] [data-checks-group]:not([data-checks-group="review"]),
[data-checks-show="accepted"] [data-checks-group]:not([data-checks-group="accepted"]) {
  display: none;
}
.checks-empty { justify-items: start; }
.checks-next, .checks-elsewhere { overflow-wrap: anywhere; }
/* A finding: its number (the mark on the canvas) or its dot, its words, its evidence, its actions. */
.checks-finding { min-width: 0; }
.checks-finding-head { display: flex; align-items: flex-start; gap: var(--st-space-8); min-width: 0; }
.checks-finding-head > .k-dot { margin-top: 7px; }
.checks-finding-text { display: grid; gap: var(--st-space-2); min-width: 0; }
.checks-finding-title { font-weight: var(--st-font-weight-medium); overflow-wrap: anywhere; }
.checks-finding-text > .k-meta { overflow-wrap: anywhere; }
.checks-num {
  display: inline-grid;
  place-items: center;
  flex: none;
  min-width: 20px;
  height: 20px;
  padding: 0 var(--st-space-4);
  border-radius: var(--st-radius-full);
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink);
  font-size: var(--st-font-size-xs);
  font-weight: var(--st-font-weight-bold);
}
.checks-num[data-tone="fix"] { background: var(--st-color-fix-soft); color: var(--st-color-fix); }
.checks-num[data-tone="review"] { background: var(--st-color-review-soft); color: var(--st-color-review); }
.checks-evidence {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--st-space-4) var(--st-space-8);
  padding-top: var(--st-space-8);
  border-top: 1px solid var(--st-color-line);
  min-width: 0;
}
.checks-evidence > strong { font-size: var(--st-font-size-lg); line-height: var(--st-line-height-tight); }
.checks-evidence > code { overflow-wrap: anywhere; }
.checks-evidence > .k-icon { align-self: center; width: 12px; height: 12px; color: var(--st-color-ink-mid); }
.checks-details > summary {
  width: fit-content;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  cursor: pointer;
}
.checks-details[open] { display: grid; gap: var(--st-space-6); }
.checks-details p { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); overflow-wrap: anywhere; }
.checks-details code { color: var(--st-color-ink); overflow-wrap: anywhere; }
.checks-details a { color: var(--st-color-ink); text-underline-offset: 3px; }
.checks-reason { overflow-wrap: anywhere; }
.checks-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--st-space-6); }
.checks-actions:empty { display: none; }
/* Accept with a reason, and Withdraw. */
.checks-waiver { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--st-space-6); min-width: 0; }
.checks-waiver:has(.checks-waiver-form) { flex: 1 1 100%; }
.checks-waiver-form { display: grid; gap: var(--st-space-6); width: 100%; }
.checks-waiver-label { display: grid; gap: var(--st-space-4); color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); }
.checks-waiver-actions { display: flex; gap: var(--st-space-6); }
.checks-waiver-error { font-size: var(--st-font-size-sm); }
.checks-waiver-error:empty { display: none; }
.checks-waiver-state { overflow-wrap: anywhere; }
/* The live checks: blocks of their own above the Checks and the Properties panes. A block is as
   tall as what it holds, up to 45 % of the panel, and never gives its room to the pane under it:
   past that it scrolls. */
.checks-live[data-edit="live-checks"], .checks-here[data-edit="live-props"] {
  flex: 0 0 auto;
  min-height: 0;
  max-height: 45%;
  overflow: auto;
  border-bottom: 1px solid var(--st-color-line);
}
.checks-here[data-off] { display: none; }
/* Edit off and no full check to tell of: nothing to show. */
.checks-live[data-off]:has(.checks-live-status:empty) { display: none; }
.checks-live[data-off] .checks-live-title { display: none; }
.checks-live-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--st-space-4) var(--st-space-8);
  padding: var(--st-space-12) var(--st-space-12) var(--st-space-8);
}
.checks-live-title {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  font-size: var(--st-font-size-sm);
  font-weight: var(--st-font-weight-bold);
}
.checks-live-status:empty { display: none; }
.checks-live-body { padding: 0 var(--st-space-12) var(--st-space-12); }
.checks-live-body:empty { display: none; }
.checks-live-group { display: grid; gap: var(--st-space-6); min-width: 0; }
.checks-live-element {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  min-width: 0;
  max-width: 100%;
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-medium);
  text-align: left;
}
.checks-live-element:hover > .k-clip { text-decoration: underline; text-underline-offset: 3px; }
.checks-live-row[data-accepted] .checks-finding-title { color: var(--st-color-ink-mid); }
.checks-here { display: grid; gap: var(--st-space-8); align-content: start; padding: var(--st-space-4) var(--st-space-12); }
.checks-here-findings { display: grid; gap: var(--st-space-8); }
/* The accessibility card of the selected element. */
.checks-a11y { display: grid; gap: var(--st-space-4); }
.checks-a11y[open] { padding-bottom: var(--st-space-6); }
/* Its head folds it, with the chevron of a group of the properties; the count stays at the end. */
.checks-a11y-head {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  min-height: 32px;
  font-weight: var(--st-font-weight-bold);
  list-style: none;
  cursor: pointer;
}
.checks-a11y-head > .k-icon {
  color: var(--st-color-ink-mid);
  transition: rotate var(--st-motion-fast) var(--st-ease-out);
}
.checks-a11y:not([open]) > .checks-a11y-head > .k-icon { rotate: -90deg; }
.checks-a11y-head > .k-chip { margin-left: auto; }
.checks-a11y-head::-webkit-details-marker { display: none; }
.checks-a11y-rows { display: grid; margin: 0; }
.checks-a11y-row > dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.checks-a11y-link { font-size: var(--st-font-size-sm); }
`;
