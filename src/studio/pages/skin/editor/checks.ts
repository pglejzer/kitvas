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
/* The summary (mock v10 \`.score\`): three tiles with a tone dot, the count over its word. The
   first two are toggles that show only their findings; Passed only tells. */
.checks-head { flex: none; display: grid; gap: var(--st-space-8); padding: var(--st-space-10) var(--st-space-14) var(--st-space-4); }
.checks-score {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--st-space-4);
  min-width: 0;
}
.checks-tile {
  position: relative;
  display: grid;
  justify-items: start;
  gap: 1px;
  min-width: 0;
  padding: var(--st-space-8) var(--st-space-10) var(--st-space-8);
  border-radius: var(--st-radius-sm);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  text-align: left;
}
button.checks-tile:hover { background: var(--st-color-raised); }
button.checks-tile[aria-pressed="true"] { background: var(--st-color-raised-strong); color: var(--st-color-ink); }
button.checks-tile:disabled { opacity: 0.45; }
button.checks-tile:disabled:hover { background: none; }
.checks-tile > span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.checks-tile > .k-dot { position: absolute; top: var(--st-space-10); right: var(--st-space-8); width: 7px; height: 7px; }
.checks-tile-count {
  color: var(--st-color-ink);
  font-size: var(--st-font-size-lg);
  font-weight: var(--st-font-weight-bold);
  line-height: var(--st-line-height-tight);
}
.checks-accepted { justify-self: start; }
.checks-run { display: flex; align-items: center; justify-content: space-between; gap: var(--st-space-8); min-width: 0; }
.checks-ran { min-width: 0; overflow-wrap: anywhere; }
.checks-ran:empty { display: none; }
.checks-run > .k-btn { margin-left: auto; flex: none; }
[data-checks-run][aria-busy="true"] { cursor: progress; }
.checks-empty .k-btn { margin-top: var(--st-space-6); }
.checks-list { display: grid; gap: var(--st-space-16); align-content: start; padding: var(--st-space-10) 0 var(--st-space-14); }
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
/* The evidence of a card of the full check (mock v10 \`.ev\`): a row on the pane's own colour, inside
   the raised card. A sample shows the finding's own colours, set as style properties by the script. */
.checks-evidence-slot:empty { display: none; }
.checks-ev {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-8);
  min-width: 0;
  padding: var(--st-space-8) var(--st-space-10);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-panel);
  font-size: var(--st-font-size-sm);
}
.checks-ev > .k-icon { width: 12px; height: 12px; color: var(--st-color-ink-mid); }
.checks-ev > small { margin-left: auto; color: var(--st-color-ink-mid); }
.checks-ev .k-change { font-weight: var(--st-font-weight-medium); }
.checks-ev .k-change del, .checks-ev .k-change ins { display: inline-flex; align-items: center; gap: var(--st-space-6); }
.checks-ev-sample {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 var(--st-space-10);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised-strong);
  box-shadow: inset 0 0 0 1px var(--st-color-line);
}
.checks-ev-meter {
  flex: 1 1 0;
  min-width: 96px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--st-space-2) var(--st-space-8);
}
.checks-ev-meter > strong { font-weight: var(--st-font-weight-bold); }
.checks-ev-meter > small { grid-column: 2; color: var(--st-color-ink-mid); font-size: var(--st-font-size-xs); }
.checks-ev-bar { position: relative; height: 4px; border-radius: 2px; background: var(--st-color-raised-strong); }
.checks-ev-bar > i { position: absolute; inset: 0 auto 0 0; width: var(--fill, 0%); border-radius: 2px; background: var(--st-color-fix); }
.checks-ev-bar > em { position: absolute; top: -3px; left: var(--mark, 67%); width: 2px; height: 10px; border-radius: 1px; background: var(--st-color-ink); }
.checks-ev-level {
  display: inline-grid;
  place-items: center;
  min-width: 28px;
  height: 22px;
  padding: 0 var(--st-space-6);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised-strong);
  font-weight: var(--st-font-weight-medium);
}
.checks-ev-level[data-missing] { background: none; box-shadow: inset 0 0 0 1.5px var(--st-color-review); color: var(--st-color-review); }
/* A card's own buttons come before the waiver's Accept, all on one wrapping line. */
.checks-card-actions { display: contents; }
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
/* A live finding's fix (ADR 0061): what Apply will do in one quiet line, then Apply or Ask Claude
   and the quiet Accept… on one line that never wraps; only the reason form takes a line of its own. */
.checks-fix-line { overflow-wrap: anywhere; }
.checks-fix-line:empty { display: none; }
.checks-fix { display: inline-flex; flex: none; }
.checks-fix:empty { display: none; }
.checks-live-row .checks-actions { flex-wrap: nowrap; min-width: 0; }
.checks-live-row .checks-actions:has(.checks-waiver-form, .checks-waiver-state) { flex-wrap: wrap; }
.checks-live-row .checks-actions .k-btn { flex: none; }
.checks-live-row .checks-waiver:not(:has(.checks-waiver-form, .checks-waiver-state)) { flex-wrap: nowrap; }
.checks-here { display: grid; gap: var(--st-space-8); align-content: start; padding: var(--st-space-4) var(--st-space-12); }
.checks-here-findings { display: grid; gap: var(--st-space-8); }
`;
