// The Sketches tab of a craft draft: the three sketches and the pick.
// Plan 18, task D. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The sketches themselves are on the canvas (the board is the built page); the tab has a card per
// sketch with the command that picks it, and after a pick the picked one, ringed, with the
// commands that take it on.

export const SKIN_EDITOR_SKETCHES = `
.sketch-body { display: grid; gap: var(--st-space-12); align-content: start; }
.sketch-title { font-size: var(--st-font-size-lg); }
.sketch-card { min-width: 0; }
.sketch-card > h3 { font-size: var(--st-font-size-md); }
.sketch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-8);
  min-width: 0;
}
.sketch-card > .k-quiet { overflow-wrap: anywhere; }
`;
