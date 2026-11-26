// The Insert pane (mock v10): search, a tab row (Components, Sections, Icons, Images), one panel at
// a time (components by category with a preview box each, sections as rows, icons as glyphs, the
// draft's images) and where to put it. Plan 18 task B; redesign plan 18e task H7b. Studio tokens
// only (`--st-*`); shared classes are `../` (`k-`). `--insert-backdrop` is the kit page's colour,
// set on the pane by the script.

export const SKIN_EDITOR_INSERT = `
.insert-head { display: grid; gap: var(--st-space-8); padding-bottom: var(--st-space-8); }
.insert-head > .k-head { min-height: 0; }
.insert-tabs {
  flex: none;
  display: flex;
  gap: var(--st-space-2);
  margin: 0 var(--st-space-12) var(--st-space-8);
  padding: var(--st-space-2);
  border-radius: var(--st-radius-md);
  background: var(--st-color-raised);
}
.insert-tabs > button {
  flex: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--st-space-4);
  min-width: 0;
  height: 24px;
  padding: 0 var(--st-space-6);
  border-radius: var(--st-radius-md);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.insert-tabs > button:hover { color: var(--st-color-ink); }
.insert-tabs > button[aria-selected="true"] {
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-bold);
}
/* Both themes: the raised step reads on the tab row's own raised fill; a hairline keeps the pressed
   tab visible where the two steps are close. */
.insert-tabs > button[aria-selected="true"] { box-shadow: inset 0 0 0 1px var(--st-color-line); }
.insert-tab-count { color: var(--st-color-ink-mid); font-size: var(--st-font-size-xs); font-weight: var(--st-font-weight-regular); }
.insert-scroll { padding: 0 var(--st-space-12) var(--st-space-12); }
.insert-panel[hidden] { display: none; }
.insert-cat {
  margin: var(--st-space-12) 0 var(--st-space-6) var(--st-space-4);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  font-weight: var(--st-font-weight-bold);
}
.insert-panel > .insert-cat:first-child { margin-top: var(--st-space-4); }
.insert-tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--st-space-8);
  margin: 0;
  padding: 0;
  list-style: none;
}
.insert-tiles > li { display: flex; min-width: 0; }
.insert-tile {
  display: grid;
  flex: 1;
  align-content: start;
  gap: var(--st-space-6);
  min-width: 0;
  padding: var(--st-space-6) var(--st-space-6) var(--st-space-6);
  border-radius: var(--st-radius-md);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  text-align: left;
  touch-action: none;
}
.insert-tile:hover:not(:disabled) { background: var(--st-color-raised); color: var(--st-color-ink); }
.insert-tile:disabled { opacity: 0.6; }
.insert-tv {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 58px;
  overflow: hidden;
  border-radius: var(--st-radius-md);
  background: var(--insert-backdrop, var(--st-color-raised-strong));
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
}
.insert-tile:hover:not(:disabled) .insert-tv {
  outline: 2px solid var(--st-color-accent);
  outline-offset: 1px;
}
.insert-tv-img {
  position: absolute;
  inset: var(--st-space-6);
  width: calc(100% - 2 * var(--st-space-6));
  height: calc(100% - 2 * var(--st-space-6));
  object-fit: contain;
}
.insert-tv-name {
  max-width: 100%;
  padding: 0 var(--st-space-6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* A preview being made: a still tint until the picture arrives. */
.insert-tv-making { opacity: 0.6; }
.insert-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.insert-part .insert-name { color: var(--st-color-ink-mid); }
.insert-tile-chip { min-height: 32px; align-content: center; background: var(--st-color-raised); }
.insert-glyphs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
  gap: var(--st-space-8);
  margin: 0;
  padding: 0;
  list-style: none;
}
.insert-glyphs > li { min-width: 0; }
.insert-glyphs + .insert-chips { margin-top: var(--st-space-8); }
.insert-glyph-tile {
  display: grid;
  place-items: center;
  width: 100%;
  min-width: 36px;
  aspect-ratio: 1;
  padding: 0;
  border-radius: var(--st-radius-md);
  background: var(--insert-backdrop, var(--st-color-raised-strong));
  touch-action: none;
}
.insert-glyph-tile:hover { outline: 2px solid var(--st-color-accent); outline-offset: 1px; }
.insert-glyph {
  display: block;
  width: 24px;
  height: 24px;
  background: var(--glyph-img) var(--glyph-x) var(--glyph-y) / var(--glyph-w) auto no-repeat;
}
.insert-rows {
  display: grid;
  gap: var(--st-space-8);
  margin: 0;
  padding: 0;
  list-style: none;
}
.insert-rows > li { display: flex; min-width: 0; }
.insert-tile-row { gap: var(--st-space-2); padding: var(--st-space-6) var(--st-space-8); background: var(--st-color-raised); }
.insert-tile-row .insert-name { color: var(--st-color-ink); }
.insert-detail {
  display: -webkit-box;
  overflow: hidden;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.insert-empty { padding: var(--st-space-16) 0; }
.insert-note { padding: var(--st-space-6) var(--st-space-12) 0; }
.insert-where {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  padding: var(--st-space-8) var(--st-space-12);
  border-top: 1px solid var(--st-color-line);
}
.insert-next { margin-left: auto; min-width: 0; max-width: 50%; }
.insert-next[hidden] { display: none; }
.insert-hint { margin: 0 0 var(--st-space-8); }
.insert-thumbs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--st-space-8);
  margin: 0;
  padding: 0;
  list-style: none;
}
.insert-thumbs > li { min-width: 0; }
.insert-thumb-item { position: relative; }
/* The delete button sits on the thumbnail's corner: out of sight until the tile is hovered or any
   control in it has focus (so a keyboard user always reaches and sees it); always shown where there
   is no hover. */
.insert-thumb-delete {
  position: absolute;
  top: var(--st-space-2);
  right: var(--st-space-2);
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink);
  opacity: 0;
}
.insert-thumb-item:hover > .insert-thumb-delete,
.insert-thumb-item:focus-within > .insert-thumb-delete,
.insert-thumb-delete:focus-visible { opacity: 1; }
.insert-thumb-delete:hover { background: var(--st-color-raised); }
@media (hover: none) {
  .insert-thumb-delete { opacity: 1; }
}
.insert-thumb {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  overflow: hidden;
  border-radius: var(--st-radius-md);
  background: var(--st-color-raised);
  color: var(--st-color-ink);
}
.insert-thumb:hover { background: var(--st-color-raised-strong); }
.insert-thumb-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.insert-thumb-name {
  position: absolute;
  inset: auto 0 0;
  padding: var(--st-space-2) var(--st-space-4);
  overflow: hidden;
  background: var(--st-color-raised);
  color: var(--st-color-ink);
  font-size: var(--st-font-size-sm);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The last cell of the Images grid: a dashed tile that opens the file picker. */
.insert-upload-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--st-space-4);
  padding: var(--st-space-4);
  border: 1px dashed var(--st-color-line-strong);
  background: none;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
  text-align: center;
}
.insert-upload-tile:hover:not(:disabled) { background: var(--st-color-raised); color: var(--st-color-ink); }
.insert-upload-tile:disabled { opacity: 0.6; }
.insert-upload-label { min-width: 0; }
/* A file dragged over the pane (\`data-over\` is set on the box by the pane's script). */
.insert-images[data-over] { outline: 1px dashed var(--st-color-accent); outline-offset: var(--st-space-4); }
/* The shield lies over the cards while a file is dragged: a frame never sees such a drag. */
.insert-shield {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-items: start center;
  padding-top: var(--st-space-24);
  outline: 2px dashed var(--st-color-accent);
  outline-offset: calc(-1 * var(--st-space-4));
}
.insert-shield-hint { margin: 0; padding: var(--st-space-6) var(--st-space-12); pointer-events: none; }
`;
