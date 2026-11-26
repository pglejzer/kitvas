// The Kit pages: the list, the anchors, swatches, scales, type samples, components.
// Plan 18, task E. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// What a token sets on its swatch, bar, corner or sample (a background, `--size`, a font size) comes
// from rules the page writes into its own style block (`views/kit-tokens.ts`).

export const SKIN_KIT = `
/* The block of both pages is the Guide's; what is long in it breaks or is cut, never widens it. */
.kit-page .info-block-in > * { min-width: 0; max-width: 100%; }
.kit-page .info-block h1 { overflow-wrap: anywhere; }
.kit-page .start-meta > * { min-width: 0; overflow-wrap: anywhere; }
.kit-lead-line { display: block; overflow-wrap: anywhere; }
.kit-cmd { width: fit-content; min-width: min(470px, 100%); max-width: 100%; }
.kit-cmd .k-cmd {
  min-height: 38px;
  /* A long id wraps the command: it keeps room above and below. */
  padding: var(--st-space-6) var(--st-space-6) var(--st-space-6) var(--st-space-12);
  border-radius: var(--st-radius-md);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
}
/* The list of kits: a card each, the start page's card surface, filling the column. */
.kit-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
  gap: var(--st-space-12);
  margin: 0;
  padding: 0;
  list-style: none;
}
.kit-tile {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--st-space-4);
  min-width: 0;
  padding: 20px;
  border-radius: var(--st-radius-lg);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
}
.kit-tile code, .kit-tile-source { overflow-wrap: anywhere; }
.kit-tile-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--st-space-6) var(--st-space-8); min-width: 0; }
.kit-tile-name { overflow-wrap: anywhere; font-size: var(--st-font-size-lg); font-weight: var(--st-font-weight-bold); text-decoration: none; }
.kit-tile a.kit-tile-name::after { content: ""; position: absolute; inset: 0; border-radius: var(--st-radius-lg); }
.kit-tile:has(a:focus-visible) { outline: 2px solid var(--st-color-accent); outline-offset: 2px; }
.kit-tile a:focus-visible { outline: none; }
.kit-state { display: flex; align-items: center; gap: var(--st-space-6); margin-top: var(--st-space-4); }
/* The ways to add a kit stand on the kit cards' columns. */
.kit-add-cards { grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); }

/* A kit's page: the kits and the links on the left, kept in view; the content on the right. */
.kit-layout {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  gap: var(--st-space-24);
  align-items: start;
}
.kit-side {
  position: sticky;
  top: calc(var(--st-size-bar) + var(--st-space-16));
  display: grid;
  gap: var(--st-space-16);
  max-height: calc(100vh - var(--st-size-bar) - var(--st-space-32));
  padding: var(--st-space-10) var(--st-space-8);
  overflow: auto;
  /* The same surface as the cards beside it, in every view. */
  border-radius: var(--st-radius-lg);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
}
.kit-side-title { margin: var(--st-space-6) var(--st-space-8); color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); }
.kit-picks, .kit-links { display: grid; gap: var(--st-space-2); margin: 0; padding: 0; list-style: none; }
.kit-pick, .kit-link {
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  min-height: var(--st-size-row);
  padding: var(--st-space-4) var(--st-space-8);
  border-radius: var(--st-radius-md);
  color: var(--st-color-ink-mid);
  text-decoration: none;
}
.kit-pick:is(a):hover, .kit-link:hover { background: var(--st-color-raised); color: var(--st-color-ink); }
.kit-pick[aria-current] { background: var(--st-color-accent-soft); color: var(--st-color-ink); }
.kit-pick-text { display: grid; flex: 1; min-width: 0; }
.kit-pick .k-dot { margin-left: auto; }
.kit-pick-off { cursor: default; }
.kit-link { justify-content: space-between; }
.kit-link-sub { padding-left: var(--st-space-24); }

.kit-main { display: grid; gap: var(--st-space-16); min-width: 0; }
.kit-part { display: grid; gap: var(--st-space-12); scroll-margin-top: calc(var(--st-size-bar) + var(--st-space-16)); }
.kit-part h2 { scroll-margin-top: calc(var(--st-size-bar) + var(--st-space-16)); }
.kit-part > h2 { font-size: var(--st-font-size-xl); }
/* A token section or the problems: a card, with its count beside the heading. */
.kit-part.kit-card { gap: var(--st-space-12); min-width: 0; }
.kit-part-head { display: flex; align-items: baseline; gap: var(--st-space-8); }
.kit-part-head h2 { font-size: var(--st-font-size-lg); }
.kit-list { margin: 0; padding-left: var(--st-space-16); overflow-wrap: anywhere; }
.kit-list code, .kit-part code { color: var(--st-color-ink-mid); overflow-wrap: anywhere; }

/* Colours: a swatch, the name, the value and the contrast on white and on black. */
.kit-colors {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--st-space-12);
  margin: 0;
  padding: 0;
  list-style: none;
}
.kit-color { display: flex; align-items: center; gap: var(--st-space-10); }
.kit-swatch {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: var(--st-radius-md);
  box-shadow: inset 0 0 0 1px var(--st-color-frame-edge);
}
.kit-color-text { display: grid; min-width: 0; }
.kit-color-text > code { overflow-wrap: anywhere; }

/* Spacing and radius, drawn: a bar as long as the token, a corner as round as it. */
.kit-scale, .kit-corners, .kit-types, .kit-other { margin: 0; padding: 0; list-style: none; }
.kit-scale { display: grid; gap: var(--st-space-8); }
/* The note of the added tokens: the mark and its words. */
.kit-added-note { display: flex; align-items: center; gap: var(--st-space-6); margin: 0; }
.kit-scale-row {
  display: grid;
  grid-template-columns: minmax(120px, 200px) 56px minmax(0, 1fr);
  align-items: center;
  gap: var(--st-space-10);
}
.kit-bar {
  display: block;
  width: min(var(--size, 0px), 100%);
  height: var(--st-space-8);
  border-radius: 2px;
  background: var(--st-color-ink-mid);
}
.kit-corners { display: flex; flex-wrap: wrap; gap: var(--st-space-24); }
.kit-corner-item { display: grid; justify-items: start; gap: var(--st-space-4); }
.kit-corner {
  width: 56px;
  height: 56px;
  border-radius: min(var(--size, 0px), 28px);
  background: var(--st-color-raised-strong);
  box-shadow: inset 0 0 0 1px var(--st-color-frame-edge);
}

/* Type: a sample line in the kit's own font, at the token's size or weight. */
.kit-types { display: grid; }
.kit-type-row {
  display: grid;
  grid-template-columns: minmax(120px, 200px) 56px minmax(0, 1fr);
  align-items: baseline;
  gap: var(--st-space-10);
  padding: var(--st-space-8) 0;
  border-top: 1px solid var(--st-color-line);
}
.kit-type-row:first-child { border-top: 0; }
.kit-type-wide { grid-column: span 2; }
.kit-sample { overflow-wrap: anywhere; line-height: var(--st-line-height-tight); }
.kit-other-row {
  display: grid;
  grid-template-columns: minmax(120px, 200px) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--st-space-10);
  padding: var(--st-space-6) 0;
  border-top: 1px solid var(--st-color-line);
}
.kit-other-row > span { overflow-wrap: anywhere; }
.kit-other-row:first-child { border-top: 0; }

/* Components: one surface each; the framed example beside the props. */
.kit-category { margin-top: var(--st-space-8); color: var(--st-color-ink-mid); font-weight: var(--st-font-weight-bold); scroll-margin-top: calc(var(--st-size-bar) + var(--st-space-16)); }
.kit-card {
  display: grid;
  gap: var(--st-space-8);
  padding: var(--st-space-16);
  border-radius: var(--st-radius-lg);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
}
.kit-card > h3 { display: flex; align-items: center; gap: var(--st-space-8); font-size: var(--st-font-size-lg); }
.kit-card-body {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: var(--st-space-16);
  align-items: start;
  margin-top: var(--st-space-4);
}
.kit-card-body:not(:has(.kit-examples)) { grid-template-columns: minmax(0, 1fr); }
.kit-card-facts, .kit-examples { display: grid; gap: var(--st-space-8); min-width: 0; }
.kit-card h4 { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); font-weight: var(--st-font-weight-medium); }
.kit-example { display: grid; gap: var(--st-space-6); margin: 0; }
.kit-example > figcaption { color: var(--st-color-ink-mid); }
.kit-frame {
  display: block;
  width: 100%;
  height: 120px;
  border: 0;
  border-radius: var(--st-radius-md);
  background: var(--st-color-canvas);
}
.kit-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--st-space-8); }
.kit-ref { display: block; width: 100%; height: auto; border-radius: var(--st-radius-md); }
.kit-source {
  margin: 0;
  padding: var(--st-space-8) var(--st-space-10);
  overflow: auto;
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised);
}
.kit-scroll { overflow: auto; }
.kit-props { width: 100%; border-collapse: collapse; font-size: var(--st-font-size-sm); }
.kit-props th { padding: 0 var(--st-space-8) var(--st-space-6) 0; color: var(--st-color-ink-mid); font-weight: var(--st-font-weight-regular); text-align: left; }
.kit-props td, .kit-props tbody th { padding: var(--st-space-6) var(--st-space-8) var(--st-space-6) 0; border-top: 1px solid var(--st-color-line); }
/* A prop's name is never cut in two: the table scrolls in its own box. */
.kit-part .kit-props code { overflow-wrap: normal; }
@media (max-width: 60rem) {
  .kit-layout { grid-template-columns: minmax(0, 1fr); }
  .kit-side { position: static; max-height: none; }
  .kit-card-body { grid-template-columns: minmax(0, 1fr); }
}
`;
