// The options of a version on the canvas (plan 25): the Options pill in the pill row and the row
// it opens under the pills. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
// The look is `docs/design/mocks/studio-mock-v10-options.html`; the markup is
// `src/studio/pages/draft/options-row.ts`, the script `client/studio/options/`.
//
// The row is one line of the pills' height, as wide as the canvas. Its values scroll sideways when
// they do not fit, with a soft edge, and its end (the default note, Reset, Make default) stays in
// view. While it is open the canvas's room starts under it: the scroller's top moves down (and the
// canvas follows its room, as it does when a panel folds), nothing else on the screen moves. The
// script puts `data-options-live` on the canvas once it has set the first state, so the glide never
// plays on load. Step 1 of the fit takes the pill's word away (`client/studio/canvas/fit/`).

export const SKIN_EDITOR_OPTIONS = `
.stage-canvas {
  --opt-h: calc(var(--st-size-control) + 2 * var(--st-space-2));
  --opt-top: calc(var(--st-space-12) + var(--opt-h) + var(--st-space-6));
  --opt-room: calc(var(--opt-top) + var(--opt-h) + var(--st-space-12));
}

/* The pill: an icon, the word, the count, a dot off the defaults, a chevron that turns over. */
.pill-options > .k-btn { gap: var(--st-space-6); }
.pill-options .pill-count { display: inline; padding: 0; }
.pill-options > .k-btn[aria-expanded="true"] {
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink);
}
.pill-options > .k-btn > .k-icon:last-child {
  transition: rotate var(--st-motion-fast) var(--st-ease-out);
}
.pill-options > .k-btn[aria-expanded="true"] > .k-icon:last-child { rotate: 180deg; }
.pill-off {
  display: inline-block;
  width: var(--st-space-6);
  height: var(--st-space-6);
  border-radius: var(--st-radius-full);
  background: var(--st-color-accent);
}
.pill-off[hidden], .opt-row [hidden] { display: none; }
.stage-canvas:is([data-fit="1"], [data-fit="2"], [data-fit="3"]) .pill-options .pill-word {
  display: none;
}

/* The row under the pills. Folded, it is out of the tab order and out of the way. */
.opt-row {
  position: absolute;
  top: var(--opt-top);
  right: var(--st-space-12);
  left: var(--st-space-12);
  z-index: 3;
  display: flex;
  align-items: center;
  height: var(--opt-h);
  padding: var(--st-space-2);
  opacity: 0;
  visibility: hidden;
  translate: 0 calc(-1 * var(--st-space-6));
  pointer-events: none;
  transition:
    opacity var(--st-motion-fast) var(--st-ease-out),
    translate var(--st-motion-fast) var(--st-ease-out),
    visibility var(--st-motion-fast);
}
.stage-canvas[data-options="open"] .opt-row {
  opacity: 1;
  visibility: visible;
  translate: none;
  pointer-events: auto;
}
.stage-canvas[data-options-live] .stage-scroll {
  transition: top var(--st-motion-fast) var(--st-ease-out);
}
.stage-canvas[data-options="open"] .stage-scroll { top: var(--opt-room); }

/* The options and their values scroll sideways; a soft edge says there is more. */
.opt-axes {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
}
.opt-axes::-webkit-scrollbar { display: none; }
.opt-axes[data-more]::after {
  content: "";
  position: sticky;
  right: 0;
  flex: none;
  align-self: stretch;
  width: 1px;
  box-shadow: calc(-1 * var(--st-space-12)) 0 var(--st-space-12) var(--st-space-4) var(--st-color-pop);
}
.opt-axis {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--st-space-2);
  padding: 0 var(--st-space-8) 0 var(--st-space-2);
}
.opt-axis + .opt-axis {
  padding-left: var(--st-space-8);
  border-left: 1px solid var(--st-color-line);
}
.opt-name {
  padding: 0 var(--st-space-6) 0 var(--st-space-4);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  white-space: nowrap;
}
/* The value in use is told by its ground and its ink, not by its weight: nothing in the row moves. */
.opt-value:hover, .opt-value[aria-pressed="true"] {
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink);
}

/* The row's end stays in view: the note while every value is the default, else Reset and Make default. */
.opt-end {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--st-space-2);
  margin-left: var(--st-space-4);
  padding-left: var(--st-space-6);
  border-left: 1px solid var(--st-color-line);
}
.opt-default {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-6);
  padding: 0 var(--st-space-10) 0 var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  white-space: nowrap;
}
.opt-make { background: var(--st-color-raised); color: var(--st-color-ink); }

/* The values that differ, after the card's size in its label above the page. */
.opt-caption {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--st-color-ink-mid);
  text-overflow: ellipsis;
}
.opt-caption:not(:empty)::before { content: "\\00b7\\00a0"; }
`;
