// The studio's skin, shared rules: the logo (spec 6.2, ADRs 0068 and 0084), drawn by
// `pages/brand/logo.ts`. The icon and the two loose parts take the accent, the word the text's
// colour. It is 20 px high; a place sets another height with a class of its own
// (`.start-brand .k-logo { height: 64px; }`) and nothing else.
//
// Two motions, both longer than the motion tokens (ADR 0068 says why). The entrance plays once for
// a tab, on a logo with `data-play`, while `<html>` has `data-logo-enter` (set before the first
// paint by `logoEntrance`). The working sign is on a bar's logo (`data-claude`) while `<html>` says
// Claude works (`data-claude="working"`, set by `client/studio/shell/bar-status.ts`): the joint (the
// icon's right part) nudges out along the seam and back in every bar logo, and the full stop also
// sways in the full logo. The shared rule of `motion.ts` stops both under reduced motion: the logo then stands whole.
//
// A CSS `transform` on an SVG element replaces its `transform` attribute, so a part a rule moves
// never carries its place: the place is the attribute of the group around it. The parts turn around
// their own centre (`transform-box: fill-box`), and their turn is the rule below, where the
// motions end.

/** The period of the working sign, in ms; the frame's mark of Claude moves with it (ADR 0084). */
export const LOGO_SWAY_MS = 1200;

export const SKIN_LOGO = `
.k-logo { display: block; width: auto; height: 20px; overflow: visible; fill: currentColor; }
.k-logo-icon, .k-logo-dot { fill: var(--st-color-accent); }
.k-logo-icon { transform-box: fill-box; transform-origin: center; }
.k-logo-joint { transform-box: fill-box; }
.k-logo-dot path { transform-box: fill-box; transform-origin: center; transform: rotate(-15deg); }
/* The entrance, about 1.1 s: the icon grows in, the letters rise one after another, then the two
   loose parts drop into place, turning as they land. */
:root[data-logo-enter] .k-logo[data-play] .k-logo-icon {
  animation: k-logo-icon 320ms var(--st-ease-out) both;
}
:root[data-logo-enter] .k-logo[data-play] .k-logo-letter {
  animation: k-logo-letter 280ms var(--st-ease-out) both;
}
:root[data-logo-enter] .k-logo[data-play] .k-logo-letter:nth-child(1) { animation-delay: 160ms; }
:root[data-logo-enter] .k-logo[data-play] .k-logo-letter:nth-child(2) { animation-delay: 205ms; }
:root[data-logo-enter] .k-logo[data-play] .k-logo-letter:nth-child(3) { animation-delay: 250ms; }
:root[data-logo-enter] .k-logo[data-play] .k-logo-letter:nth-child(4) { animation-delay: 295ms; }
:root[data-logo-enter] .k-logo[data-play] .k-logo-letter:nth-child(5) { animation-delay: 340ms; }
:root[data-logo-enter] .k-logo[data-play] .k-logo-letter:nth-child(6) { animation-delay: 385ms; }
:root[data-logo-enter] .k-logo[data-play] .k-logo-dot path {
  animation: k-logo-land 420ms var(--st-ease-out) both;
}
:root[data-logo-enter] .k-logo[data-play] .k-logo-dot-i path { animation-delay: 560ms; }
:root[data-logo-enter] .k-logo[data-play] .k-logo-stop path { animation-delay: 700ms; }
@keyframes k-logo-icon { from { opacity: 0; transform: scale(0.82); } }
@keyframes k-logo-letter { from { opacity: 0; transform: translateY(8px); } }
@keyframes k-logo-land { from { opacity: 0; transform: translateY(-10px) rotate(-75deg); } }
/* While Claude works the full stop of a bar's logo sways, from its turn to +10 degrees and back,
   for as long as the state lasts. */
:root[data-claude="working"] .k-logo[data-claude] .k-logo-stop path {
  animation: k-logo-sway ${LOGO_SWAY_MS / 1000}s ease-in-out infinite;
}
@keyframes k-logo-sway { 50% { transform: rotate(10deg); } }
/* The same state nudges the right part of the icon 1.5 units out along the joint and back, as if the
   two parts were being fitted: the only motion of a bar's mark. */
:root[data-claude="working"] .k-logo[data-claude] .k-logo-joint {
  animation: k-logo-fit ${LOGO_SWAY_MS / 1000}s ease-in-out infinite;
}
@keyframes k-logo-fit { 50% { transform: translateX(1.5px); } }
`;
