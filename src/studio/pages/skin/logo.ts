// The studio's skin, shared rules: the logo (spec 6.2, ADR 0068), drawn by `pages/brand/logo.ts`.
// One colour, the text's. It is 20 px high; a place sets another height with a class of its own
// (`.start-brand .k-logo { height: 64px; }`) and nothing else.
//
// Two motions, both longer than the motion tokens (ADR 0068 says why). The entrance plays once for
// a tab, on a logo with `data-play`, while `<html>` has `data-logo-enter` (set before the first
// paint by `logoEntrance`). The working sign is on a bar's logo (`data-claude`) while `<html>` says
// Claude works (`data-claude="working"`, set by `client/studio/shell/bar-status.ts`). The shared
// rule of `motion.ts` stops both under reduced motion: the logo then stands whole, and the working
// pointer keeps the accent colour, which is no motion.
//
// SVG parts take their transform origin at the drawing's top left, so the places below are in the
// drawing's own units. The pointer's place is the same as the `transform` its path carries.

export const SKIN_LOGO = `
.k-logo { display: block; width: auto; height: 20px; overflow: visible; fill: currentColor; }
.k-logo-pointer { transform: translate(34px, 34px) rotate(135deg) scale(0.83) translate(-16px, -35px); }
/* The entrance, about 1.3 s: the block grows in, the letters rise one after another, then a copy
   of the "v" lifts off the word in the accent colour and docks as the pointer. */
:root[data-logo-enter] .k-logo[data-play] .k-logo-block {
  transform-origin: 22px 22px;
  animation: k-logo-block 320ms var(--st-ease-out) both;
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
:root[data-logo-enter] .k-logo[data-play] .k-logo-pointer {
  animation: k-logo-fly 680ms cubic-bezier(0.45, 0, 0.15, 1) 640ms both;
}
@keyframes k-logo-block { from { opacity: 0; transform: scale(0.82); } }
@keyframes k-logo-letter { from { opacity: 0; transform: translateY(12px); } }
/* From the place of the word's "v" to the pointer's place on the block, turning back to the ink
   as it lands. */
@keyframes k-logo-fly {
  0% {
    opacity: 0;
    fill: var(--st-color-accent);
    transform: translate(146px, 21px) rotate(0deg) scale(1) translate(0px, 0px);
  }
  6% { opacity: 1; }
  70% { fill: var(--st-color-accent); }
  100% {
    opacity: 1;
    transform: translate(34px, 34px) rotate(135deg) scale(0.83) translate(-16px, -35px);
  }
}
/* While Claude works the pointer of a bar's logo takes the accent and taps the block, 3.5 px in
   and back, for as long as the state lasts. */
:root[data-claude="working"] .k-logo[data-claude] .k-logo-pointer {
  fill: var(--st-color-accent);
  animation: k-logo-tap 1.2s ease-in-out infinite;
}
@keyframes k-logo-tap {
  50% { transform: translate(30.5px, 30.5px) rotate(135deg) scale(0.83) translate(-16px, -35px); }
}
`;
