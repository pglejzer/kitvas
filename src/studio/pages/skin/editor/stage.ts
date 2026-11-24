// The canvas (plan 18, task A; spec goal 5): the canvas ground with nothing drawn on it, the width
// cards with their labels and the frame shadow, the width handle, the pan, and the pills that
// float over it: width, cards and state at the top right, zoom at the bottom right. The top left
// and the bottom centre stay free for the lens pill and the ask bar of part 2.
// Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The page script scales the world (`client/studio/canvas/canvas.ts`) and sets `--canvas-zoom` on
// it; the labels and the handle divide by it to keep their size on the screen.

export const SKIN_EDITOR_STAGE = `
.stage-canvas {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: none;
  user-select: none;
}
.stage-canvas input, .stage-canvas textarea { user-select: text; }
.stage-scroll {
  position: absolute;
  inset: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.stage-sizer { position: relative; min-width: 100%; min-height: 100%; }
.stage-world {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: flex-start;
  gap: calc(2 * var(--st-space-24));
  width: max-content;
  margin: var(--st-space-32);
  transform-origin: 0 0;
}
.stage-scroll[data-live] .stage-world { margin: 0; }
.stage-shield { position: absolute; inset: 0; z-index: 2; cursor: grab; touch-action: none; }
.stage-scroll[data-pan] { cursor: grab; }
.stage-scroll[data-panning],
.stage-scroll[data-panning] .stage-shield { cursor: grabbing; user-select: none; }
.stage-scroll[data-panning] iframe,
.side-screen[data-resizing] .stage-world iframe { pointer-events: none; }
.side-screen[data-resizing] { cursor: ew-resize; user-select: none; }
/* A version that is not built: one sentence and the command that builds it. */
.stage-empty {
  width: min(440px, calc(100% - 2 * var(--st-space-24)));
  border-radius: var(--st-radius-lg);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-island);
}

/* A card: its label above, then the frame, set off by the frame shadow and no border of its own. */
.card-box { display: grid; flex: none; gap: var(--st-space-8); margin: 0; }
.card-caption {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--st-space-8);
  width: calc(100% * var(--canvas-zoom, 1));
  height: var(--st-space-24);
  overflow: hidden;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  line-height: var(--st-space-24);
  white-space: nowrap;
  transform: scale(calc(1 / var(--canvas-zoom, 1)));
  transform-origin: 0 100%;
}
.card-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-medium);
}
.card-size, .card-mark { flex: none; }
/* The card edits go to, in Edit: its label says so, and its frame is ringed in the accent. */
.card-mark { display: none; }
[data-mode="edit"] .card-box[data-editing] .card-mark { display: inline-flex; }
[data-mode="edit"] .card-box[data-editing] .card-frame > iframe {
  outline: 1px solid var(--st-color-accent);
  outline-offset: var(--st-space-4);
}
.card-frame { position: relative; width: max-content; max-width: none; overflow: visible; }
/* A draft is not themed: its frame keeps the light canvas a page has in a browser. */
.card-frame > iframe {
  display: block;
  box-sizing: content-box;
  height: 800px;
  min-height: 0;
  border: 0;
  border-radius: var(--st-radius-sm);
  color-scheme: light;
  background: Canvas;
  box-shadow: var(--st-shadow-frame);
}
/* An older version, read only: its frame is ringed by a dashed line. */
.card-box[data-viewing] .card-frame > iframe {
  outline: 1px dashed var(--st-color-line-strong);
  outline-offset: var(--st-space-4);
}

/* The width handle on the current card's right edge. */
.card-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 100%;
  display: grid;
  place-items: center;
  width: calc(16px / var(--canvas-zoom, 1));
  cursor: ew-resize;
  touch-action: none;
}
.card-handle::after {
  content: "";
  width: calc(4px / var(--canvas-zoom, 1));
  height: calc(48px / var(--canvas-zoom, 1));
  border-radius: var(--st-radius-full);
  background: var(--st-color-line-strong);
}
.card-handle:hover::after { background: var(--st-color-ink-mid); }
.card-handle:focus-visible::after,
.side-screen[data-resizing] .card-handle::after { background: var(--st-color-accent); }
.card-handle:focus-visible { outline: none; }

/* The pills at the top right: width, cards and state; they wrap to the right, leaving the top
   left free. */
.pill-row {
  position: absolute;
  top: var(--st-space-12);
  right: var(--st-space-12);
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--st-space-6);
  max-width: calc(100% - 200px);
}
.pill-group { display: flex; align-items: center; gap: var(--st-space-2); }
.pill-opt:hover, .pill-opt[aria-current] {
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink);
}
.pill-opt[aria-current] { font-weight: var(--st-font-weight-bold); }
.pill-num { color: var(--st-color-ink-mid); font-weight: var(--st-font-weight-regular); }
.pill-cap {
  padding: 0 var(--st-space-4) 0 var(--st-space-8);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.pill-field {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-4);
  margin: 0;
  padding-right: var(--st-space-8);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.pill-number { width: 72px; text-align: right; }
/* At a width that is not a preset the checks' marks are hidden: a mark at the pill's end. */
.pill-mark, .pill-mark:hover { color: var(--st-color-review); }

/* The zoom pill at the bottom right: −, the percent, +, and the menu that opens upwards. */
.pill-zoom { position: absolute; right: var(--st-space-12); bottom: var(--st-space-12); z-index: 3; }
.pill-zoom:empty { display: none; }
.pill-level { width: 56px; text-align: center; }
.pill-zoom[data-fit] .pill-level { font-weight: var(--st-font-weight-bold); }
.pill-menu { position: relative; display: flex; }
.pill-menu > summary { list-style: none; }
.pill-menu > summary::-webkit-details-marker { display: none; }
.pill-menu[open] > summary { background: var(--st-color-raised-strong); color: var(--st-color-ink); }
.pill-list {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--st-space-8));
  z-index: 5;
  display: grid;
}
/* A closed menu's list keeps no finished entrance, so it rises in again when the menu opens. */
.pill-menu:not([open]) > .pill-list { animation: none; }
.pill-list > [aria-pressed="true"] { font-weight: var(--st-font-weight-bold); }
`;
