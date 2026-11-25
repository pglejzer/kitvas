// The tools on the selection (redesign spec, goals 11 and 12; plan 19, task 4; mock v10 lines 152
// to 162): the action bar and, in its place, the variant pill. Page markup over the canvas, placed
// by the script from where the frame says the selected element is.
// Studio tokens only (`--st-*`); shared classes are `../` (`k-`): each tool is a `.k-pop.k-pill`
// of `.k-btn` and `.k-icon-btn` with a `.k-sep`, Apply the `.k-btn-primary`.
//
// The host takes no room; each tool stands at the stage's corner and the script moves it with
// `translate`, as `.k-pop` rises in by `transform` when it is shown. A tool kept away during a
// movement is only made invisible, so it does not rise in again when it comes back. A button that
// is off keeps its focus and its title (`aria-disabled`), dimmed as a disabled one.

export const SKIN_EDITOR_SELTOOLS = `
.sel-tools { position: absolute; top: 0; left: 0; z-index: 3; }
.sel-tools:empty { display: none; }
.sel-bar, .var-pill {
  position: absolute;
  top: 0;
  left: 0;
  font-size: var(--st-font-size-label);
  white-space: nowrap;
}
.sel-bar[hidden], .var-pill[hidden] { display: none; }
.sel-bar[data-away], .var-pill[data-away] { visibility: hidden; }
.sel-bar > .k-sep, .var-pill > .k-sep { margin: 0 var(--st-space-2); }
/* The element's name: the ink, bold; a component's icon in the accent, as the selection is. */
.sel-who {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-6);
  min-width: 0;
  max-width: 180px;
  padding: 0 var(--st-space-6) 0 var(--st-space-8);
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-bold);
}
.sel-mark { display: inline-flex; flex: none; color: var(--st-color-accent); }
.sel-mark:empty { display: none; }
.sel-bar .k-icon-btn[aria-disabled="true"], .var-pill .k-icon-btn[aria-disabled="true"] {
  opacity: 0.45;
}
.sel-bar .k-icon-btn[aria-disabled="true"]:hover,
.var-pill .k-icon-btn[aria-disabled="true"]:hover {
  background: none;
  color: var(--st-color-ink-mid);
}
/* "Variant 1 of 2" between previous and next. */
.var-count {
  padding: 0 var(--st-space-4);
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-bold);
  font-variant-numeric: tabular-nums;
}
/* Apply while the variant cannot be applied: the primary's disabled look. */
.var-apply[aria-disabled="true"], .var-apply[aria-disabled="true"]:hover {
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink-mid);
  opacity: 1;
}
[data-mode="preview"] .sel-tools { display: none; }
`;
