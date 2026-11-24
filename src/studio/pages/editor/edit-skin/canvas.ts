// The editor screen's canvas skin (plan 15, task B): the cards with their captions, compare side
// by side, the dock, the width handle and the pan shield. Base kit tokens only. It comes after the
// studio's older stage rules and overrides them.
//
// The canvas region itself never scrolls: the scroller inside it does, and the dock floats over
// it. The page script scales the world (`client/studio/canvas/canvas.ts`) and sets
// `--canvas-zoom` on it; the captions and the handle divide by it to keep their size on screen.

export const EDIT_SKIN_CANVAS = `
[data-shell="canvas"] {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--kit-color-bg);
}
.canvas-scroll {
  position: absolute;
  inset: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.canvas-sizer {
  position: relative;
  min-width: 100%;
  min-height: 100%;
}
.canvas-world {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: flex-start;
  gap: var(--kit-space-3xl);
  width: max-content;
  margin: var(--kit-space-xl);
  transform-origin: 0 0;
}
.canvas-scroll[data-live] .canvas-world { margin: 0; }
.canvas-empty { margin: var(--kit-space-2xl); color: var(--kit-color-ink-mid); }
.canvas-world > .pane { flex: none; min-width: 0; max-width: none; }
.canvas-card {
  display: grid;
  gap: var(--kit-space-sm);
  margin: 0;
}
.card-caption {
  display: flex;
  justify-content: space-between;
  gap: var(--kit-space-lg);
  width: calc(100% * var(--canvas-zoom, 1));
  height: 1.5rem;
  overflow: hidden;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
  line-height: 1.5rem;
  white-space: nowrap;
  transform: scale(calc(1 / var(--canvas-zoom, 1)));
  transform-origin: 0 100%;
}
.card-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.card-size { flex: none; font-variant-numeric: tabular-nums; }
.canvas-card .frame-box {
  position: relative;
  width: max-content;
  max-width: none;
  overflow: visible;
}
.canvas-card .frame-box iframe {
  display: block;
  box-sizing: content-box;
  height: 800px;
  min-height: 0;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-lg);
  background: var(--kit-color-surface);
}
.canvas-world .original-shot { display: block; max-width: none; }
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
  content: '';
  width: calc(4px / var(--canvas-zoom, 1));
  height: calc(48px / var(--canvas-zoom, 1));
  border-radius: calc(2px / var(--canvas-zoom, 1));
  background: var(--kit-color-line-strong);
}
.card-handle:hover::after,
.card-handle:focus-visible::after,
[data-resizing] .card-handle::after { background: var(--kit-color-ink); }
.card-handle:focus-visible { outline-offset: 0; }
.canvas-shield {
  position: absolute;
  inset: 0;
  z-index: 2;
  cursor: grab;
  touch-action: none;
}
.canvas-shield[hidden] { display: none; }
.canvas-scroll[data-pan] { cursor: grab; }
.canvas-scroll[data-panning],
.canvas-scroll[data-panning] .canvas-shield { cursor: grabbing; user-select: none; }
.canvas-scroll[data-panning] iframe,
[data-resizing] .canvas-world iframe { pointer-events: none; }
[data-resizing] { cursor: ew-resize; user-select: none; }
[data-shell="canvas"] .compare-summary {
  position: absolute;
  top: var(--kit-space-md);
  left: 50%;
  z-index: 3;
  max-width: calc(100% - 2 * var(--kit-space-lg));
  margin: 0;
  padding: var(--kit-space-xs) var(--kit-space-md);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
  transform: translateX(-50%);
}
[data-shell="canvas"] .compare-summary:empty { display: none; }
.editor-dock {
  position: absolute;
  left: 50%;
  bottom: var(--kit-space-lg);
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--kit-space-xs) var(--kit-space-lg);
  width: max-content;
  max-width: calc(100% - 2 * var(--kit-space-lg));
  padding: var(--kit-space-xs) var(--kit-space-md);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-lg);
  background: var(--kit-color-surface);
  font-size: var(--kit-font-size-sm);
  transform: translateX(-50%);
}
.editor-dock .editor-dock {
  position: static;
  max-width: none;
  padding: 0;
  border: 0;
  transform: none;
}
.dock-part {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-md);
  min-width: 0;
}
.dock-part + .dock-part {
  padding-left: var(--kit-space-lg);
  border-left: 1px solid var(--kit-color-line);
}
.dock-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-md);
}
.dock-links .opt { font-variant-numeric: tabular-nums; }
.dock-field {
  display: inline-flex;
  align-items: center;
  gap: var(--kit-space-xs);
  margin: 0;
  color: var(--kit-color-ink-mid);
}
.dock-field input {
  width: 4.5rem;
  min-height: 24px;
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
}
.dock-note {
  position: absolute;
  left: 50%;
  bottom: calc(100% + var(--kit-space-sm));
  width: max-content;
  max-width: 100%;
  margin: 0;
  padding: var(--kit-space-xs) var(--kit-space-md);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink-mid);
  transform: translateX(-50%);
}
.dock-note[hidden] { display: none; }
`;
