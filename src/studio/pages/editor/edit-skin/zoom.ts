// The canvas's styles: the zoom strip in the dock (plan 15, task B): −, the typed percent, + and
// the menu. Base kit tokens only (`pages/skin.ts` rules). The world itself is scaled by the page
// script (`client/studio/canvas/`); the canvas, the cards and the pan are in `canvas.ts`.

export const EDIT_SKIN_ZOOM = `
[data-dock="zoom"] {
  display: flex;
  align-items: center;
  gap: var(--kit-space-xs);
}
[data-dock="zoom"]:empty { display: none; }
[data-dock="zoom"] button,
[data-dock="zoom"] summary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  min-width: 24px;
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
[data-dock="zoom"] button:disabled {
  border-color: var(--kit-color-line);
  color: var(--kit-color-ink-mid);
  cursor: default;
}
[data-dock="zoom"] .zoom-level {
  width: 4rem;
  min-height: 24px;
  padding: 0 var(--kit-space-xs);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  text-align: center;
}
[data-dock="zoom"][data-fit] .zoom-level { font-weight: var(--kit-font-weight-medium); }
.zoom-menu { position: relative; }
.zoom-menu summary { list-style: none; }
.zoom-menu summary::-webkit-details-marker { display: none; }
.zoom-menu summary::before {
  content: '';
  width: 6px;
  height: 6px;
  border-right: 2px solid currentColor;
  border-top: 2px solid currentColor;
  transform: translateY(2px) rotate(-45deg);
}
.zoom-menu-list {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--kit-space-sm));
  z-index: 5;
  display: grid;
  gap: var(--kit-space-xs);
  min-width: 11rem;
  padding: var(--kit-space-xs);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
}
[data-dock="zoom"] .zoom-menu-item {
  justify-content: space-between;
  gap: var(--kit-space-lg);
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border-color: transparent;
  text-align: left;
}
[data-dock="zoom"] .zoom-menu-item:hover:not(:disabled),
[data-dock="zoom"] .zoom-menu-item:focus-visible { background: var(--kit-color-bg); }
[data-dock="zoom"] .zoom-menu-item[aria-pressed="true"] {
  font-weight: var(--kit-font-weight-medium);
}
.zoom-menu-item kbd {
  color: var(--kit-color-ink-mid);
  font-family: var(--kit-font-mono);
  font-size: var(--kit-font-size-sm);
}
`;
