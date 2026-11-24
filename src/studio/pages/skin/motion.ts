// The studio's skin, shared rules: motion (ADR 0057). Motion answers what the person did: what
// opens rises in, a pane's content rises in when it changes, a new row slides in, a changed
// element flashes once. Nothing moves on hover, while idle, or when the theme, the panels or the
// accent change; nothing bounces; nothing delays input. Under reduced motion all of it is off.
//
// The entrances animate \`transform\`. Place a thing that enters with the \`translate\` property
// (as \`.k-toast\` does), never with \`transform\`, or the entrance takes its place away.

export const SKIN_MOTION = `
@keyframes k-pop-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } }
@keyframes k-rise-in { from { opacity: 0; transform: translateY(6px); } }
@keyframes k-slide-in { from { opacity: 0; transform: translateX(-12px); } }
@keyframes k-pulse { 50% { opacity: 0.35; } }
@keyframes k-flash {
  from { box-shadow: 0 0 0 0 var(--st-color-select); }
  to { box-shadow: 0 0 0 16px transparent; }
}
/* Whatever floats enters when it is shown: \`hidden\` off, or a dialog opened. */
.k-pop:not([hidden]) { animation: k-pop-in var(--st-motion-fast) var(--st-ease-out); }
/* A pane's content after the tab, the rail item or the lens changed: the script adds the class
   to the shown pane (or the pane is shown by taking \`hidden\` off). */
.k-rise:not([hidden]) { animation: k-rise-in var(--st-motion-fast) var(--st-ease-out); }
/* A row that was just added: a saved version, a new note. */
.k-slide { animation: k-slide-in var(--st-motion-slow) var(--st-ease-out); }
/* A thing that just changed, once. */
.k-flash { animation: k-flash var(--st-motion-flash) ease-out; }
/* The theme, the panels or the accent changing: the page changes in one step. */
:root[data-view-changing] *, :root[data-view-changing] *::before, :root[data-view-changing] *::after {
  transition: none !important;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
