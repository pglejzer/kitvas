// The Drafts page: the filter row, the grid of cards, the empty state.
// Plan 18, task E. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// A card is one surface: the panel colour, a large radius and a low shadow. Nothing inside it has a
// fill and a border of its own; the thumbnail sits on the canvas ground and the text is set apart
// by space alone.

export const SKIN_GALLERY = `
.gallery-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-12);
  margin-bottom: var(--st-space-16);
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 280px);
  gap: var(--st-space-16);
  margin: 0;
  padding: 0;
  list-style: none;
}
.gallery-card {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--st-space-4);
  padding: var(--st-space-8) var(--st-space-8) var(--st-space-12);
  border-radius: var(--st-radius-lg);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
}
/* The draft runs at 1280 px wide and is drawn at 280 / 1280 of that: a picture, not a page. */
.gallery-thumb {
  width: 264px;
  height: 217px;
  overflow: hidden;
  border-radius: var(--st-radius-md);
  background: var(--st-color-canvas);
}
.gallery-thumb iframe {
  display: block;
  width: 1280px;
  height: 1050px;
  border: 0;
  transform-origin: 0 0;
  scale: 0.20625;
}
.gallery-card > h2 { margin: var(--st-space-8) var(--st-space-4) 0; }
.gallery-name { text-decoration: none; }
/* The whole card is the link. */
.gallery-name::after { content: ""; position: absolute; inset: 0; border-radius: var(--st-radius-lg); }
.gallery-card:has(.gallery-name:focus-visible) {
  outline: 2px solid var(--st-color-accent);
  outline-offset: 2px;
}
.gallery-name:focus-visible { outline: none; }
.gallery-meta, .gallery-status { margin: 0 var(--st-space-4); }
.gallery-meta { display: flex; flex-wrap: wrap; }
.gallery-meta > * + *::before { content: "\\00b7"; margin: 0 var(--st-space-6); }
.gallery-status { display: flex; align-items: center; gap: var(--st-space-6); }
.gallery-empty { max-width: 460px; padding-left: 0; }
@media (max-width: 40rem) {
  .gallery-grid { grid-template-columns: minmax(0, 280px); }
}
`;
