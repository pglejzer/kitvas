// The start page (`/`): the page column, the block in the inverted scope, the start switch, the
// first steps and the foot line. The drafts' grid, its fold and the cards are `gallery.ts`.
// Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The block stands in `.k-inverse` (`src/studio/theme/`): inside it the colour tokens are set
// again, so the shared segmented control, command box and links need no colours here. Nothing in
// the block moves except the logo's entrance (`skin/logo.ts`).

export const SKIN_START = `
.start {
  display: grid;
  gap: var(--st-space-32);
  max-width: 1360px;
  margin: 0 auto;
  padding: var(--st-space-24) var(--st-space-24) 72px;
}
.start-block {
  position: relative;
  overflow: hidden;
  border-radius: var(--st-radius-lg);
  background: var(--st-color-canvas);
  color: var(--st-color-ink);
}
.start-block-in {
  position: relative;
  display: grid;
  align-items: center;
  min-height: 340px;
  padding: 44px 48px;
}
/* The mark alone, very large, cut by the block's edges, in two flat tints of the ground. */
.start-giant {
  position: absolute;
  right: -24px;
  bottom: -150px;
  height: 520px;
  pointer-events: none;
}
.start-giant .k-logo-block { fill: var(--st-color-panel); }
.start-giant .k-logo-pointer { fill: var(--st-color-line); }
.start-brand {
  display: grid;
  gap: var(--st-space-16);
  justify-items: start;
  min-width: 0;
}
.start-name { display: flex; margin: 0; }
.start-brand .k-logo { height: 64px; }
.start-lead {
  max-width: 30ch;
  color: var(--st-color-ink-mid);
  font-size: 20px;
  line-height: 1.35;
}
.start-lead strong { color: var(--st-color-ink); font-weight: var(--st-font-weight-medium); }
.start-go { display: grid; gap: var(--st-space-8); width: min(470px, 100%); }
.start-seg { justify-self: start; flex-wrap: wrap; max-width: 100%; }
.start-choice { display: grid; gap: var(--st-space-8); }
/* The switch works with the script: until the page's script has set \`data-fold\` on the root,
   every command is shown and the buttons are hidden. */
:root:not([data-fold]) .start-seg { display: none; }
:root[data-fold] .start-choice:not([data-on]) { display: none; }
.start-what { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); }
.start-go .k-cmd {
  min-height: 38px;
  padding: 0 var(--st-space-6) 0 var(--st-space-12);
  border-radius: var(--st-radius-md);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
}
.start-go .k-cmd > code { font-size: var(--st-font-size-md); }
.start-meta {
  display: flex;
  flex-wrap: wrap;
  max-width: 100%;
  min-width: 0;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.start-meta > * + *::before { content: "\\00b7"; margin: 0 var(--st-space-6); }
.start-meta a { text-decoration: none; }
.start-meta a:hover { color: var(--st-color-ink); text-decoration: underline; }
/* A long kit name is cut. */
.start-kit {
  display: block;
  min-width: 0;
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.start-drafts { display: grid; gap: var(--st-space-12); min-width: 0; }
.start-drafts .gallery-head { flex-wrap: wrap; margin-bottom: 0; }
.start-more { margin: 0; text-align: center; }
/* First run: three steps in place of the drafts. */
.start-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--st-space-12);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}
.start-steps > li {
  display: grid;
  align-content: start;
  gap: var(--st-space-4);
  padding: var(--st-space-16);
  border-radius: var(--st-radius-lg);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
  counter-increment: step;
}
.start-steps > li::before {
  content: counter(step);
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-bottom: var(--st-space-4);
  border-radius: var(--st-radius-full);
  background: var(--st-color-accent-soft);
  color: var(--st-color-accent);
  font-size: var(--st-font-size-xs);
  font-weight: var(--st-font-weight-bold);
}
.start-steps p { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); }
/* The last line of the page. */
.start-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.start-foot > * + *::before { content: "\\00b7"; margin: 0 var(--st-space-8); }
.start-foot a { text-decoration: none; }
.start-foot a:hover { color: var(--st-color-ink); text-decoration: underline; }
/* Narrower than a laptop the large mark goes and the content fills the block. */
@media (max-width: 1023px) {
  .start-giant { display: none; }
  .start-block-in { min-height: 0; padding: var(--st-space-32) var(--st-space-24); }
}
@media (max-width: 48rem) {
  .start-steps { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 40rem) {
  .start { padding: var(--st-space-16) var(--st-space-16) 48px; }
  .start-block-in { padding: var(--st-space-24) var(--st-space-16); }
  .start-brand .k-logo { height: 48px; }
  .start-seg > button { padding: 0 var(--st-space-6); }
}
`;
