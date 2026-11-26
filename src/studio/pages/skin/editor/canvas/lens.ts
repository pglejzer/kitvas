// The lens pill (redesign spec, goal 9; plan 19, task 1; mock v10 lines 125 to 135 and 164 to 166):
// at the canvas's top left, across from the width pill: a quiet "Lens" caption, then a button per
// lens, the one on pressed as the width pill's chosen width is, with its count in the quiet ink.
// The pins themselves are drawn inside the frame (`client/frame/lens/`), with the studio's tones
// and none of these rules. When the canvas is narrow the pill shows the lens in use and a menu.
// Studio tokens only (`--st-*`); shared classes are `../` (`k-`).

export const SKIN_EDITOR_LENS = `
.pill-lens { position: absolute; top: var(--st-space-12); left: var(--st-space-12); z-index: 3; }
.pill-lens:empty { display: none; }
.pill-lens-cap {
  padding: 0 var(--st-space-6) 0 var(--st-space-8);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  white-space: nowrap;
}
.pill-lens-opt { gap: var(--st-space-6); }
.pill-lens-opt:hover, .pill-lens-opt[aria-pressed="true"] {
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink);
}
.pill-lens-opt[aria-pressed="true"] .pill-lens-name { font-weight: var(--st-font-weight-bold); }
/* The label keeps the width of its bold self, so pressing a lens moves no button. */
.pill-lens-name { display: inline-grid; }
.pill-lens-name::after {
  content: attr(data-text);
  height: 0;
  overflow: hidden;
  visibility: hidden;
  font-weight: var(--st-font-weight-bold);
}
.pill-lens-opt > .pill-num:empty { display: none; }
/* The narrowed form (step 3 of the fit, \`client/studio/canvas/fit/\`): the lens in use stays, the
   others go into the menu. The menu opens from the pill's left edge. */
.pill-lens > .pill-lens-more { display: none; }
.stage-canvas[data-fit="3"] .pill-lens > .pill-lens-more { display: flex; }
.stage-canvas[data-fit="3"] .pill-lens > .pill-lens-opt:not([aria-pressed="true"]) { display: none; }
.pill-lens-more > summary { padding: 0 var(--st-space-4); }
.pill-lens-more > .pill-sizes { right: auto; left: 0; }
.pill-lens-list > [aria-current] { font-weight: var(--st-font-weight-bold); }`;
