// The Insert pane: search, the kit's components as tiles by category, images, and where to put it.
// Plan 18, task B. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).

export const SKIN_EDITOR_INSERT = `
.insert-head { display: grid; gap: var(--st-space-8); padding-bottom: var(--st-space-4); }
.insert-head > .k-head { min-height: 0; }
.insert-scroll { padding: 0 var(--st-space-12) var(--st-space-12); }
.insert-groups { display: grid; gap: var(--st-space-12); }
.insert-cat {
  margin: 0 0 var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  font-weight: var(--st-font-weight-bold);
}
.insert-tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--st-space-6);
  margin: 0;
  padding: 0;
  list-style: none;
}
.insert-tiles > li { min-width: 0; }
.insert-tile {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  width: 100%;
  min-height: 32px;
  padding: 0 var(--st-space-8);
  border-radius: var(--st-radius-md);
  background: var(--st-color-raised);
  color: var(--st-color-ink);
  text-align: left;
  touch-action: none;
}
.insert-tile > .k-icon { color: var(--st-color-ink-mid); }
.insert-tile:hover:not(:disabled) { background: var(--st-color-raised-strong); }
.insert-tile:disabled { color: var(--st-color-ink-mid); opacity: 0.6; }
.insert-part .insert-name { color: var(--st-color-ink-mid); }
.insert-empty { padding: var(--st-space-16) 0; }
.insert-note { padding: var(--st-space-6) var(--st-space-12) 0; }
.insert-where { justify-content: space-between; }
.insert-images { display: grid; justify-items: start; gap: var(--st-space-6); }
.insert-images > .insert-cat { margin: 0; }
.insert-hint { margin: 0; }
.insert-upload { display: inline-flex; align-items: center; }
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
