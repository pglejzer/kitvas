// Compare and the original of a rework (plan 18, task A; spec goal 6): the two versions as cards
// side by side, each with its label; the frames outline and tag the changed and added elements as
// before. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The compare sentence floats at the canvas's bottom centre: a comparison is never edited, so the
// ask bar of part 2 never needs that place while it shows.

export const SKIN_EDITOR_COMPARE = `
.cmp-summary {
  position: absolute;
  bottom: var(--st-space-12);
  left: 50%;
  z-index: 3;
  max-width: calc(100% - 320px);
  padding: var(--st-space-6) var(--st-space-12);
  translate: -50% 0;
  color: var(--st-color-ink);
  font-size: var(--st-font-size-sm);
}
.cmp-summary:empty { display: none; }
/* The original's picture stands where a frame would, with the same shadow. */
.cmp-shot {
  display: block;
  max-width: none;
  height: auto;
  border-radius: var(--st-radius-sm);
  box-shadow: var(--st-shadow-frame);
}
/* A card with nothing to frame: a version not built, or an original without a picture. It stands
   where the frame would, with the frame's shadow. */
.cmp-empty {
  width: 390px;
  border-radius: var(--st-radius-sm);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-frame);
}
/* The original's counts under its picture, kept at their size on the screen as the label is. */
.cmp-facts {
  display: grid;
  gap: var(--st-space-2);
  width: calc(100% * var(--canvas-zoom, 1));
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  transform: scale(calc(1 / var(--canvas-zoom, 1)));
  transform-origin: 0 0;
}
`;
