// The sheet of the handles' overlay (`handles.ts`): a zone that takes the pointer with the bar
// drawn inside it, the shield that takes every pointer event while a handle is held, and the label
// of the value. Tones come from `toned` (`guides.ts`); system colours stand in before the studio's.

import { MAX_GAPS } from './spots.ts';

/** The shield and the label lie over every handle, however many there are. */
const ABOVE = MAX_GAPS + 16;

const FOCUS = 'var(--kv-select, Highlight)';

export const HANDLES_SHEET = `
.handle, .bar, .value { position: absolute; left: 0; top: 0; box-sizing: border-box; }
.handle { pointer-events: auto; touch-action: none; }
.bar {
  pointer-events: none; border-style: solid; border-color: ${FOCUS};
  background: var(--kv-on-select, Canvas);
}
.handle[data-kind^="padding"] .bar, .handle[data-kind="gap"] .bar {
  background: ${FOCUS}; border-color: var(--kv-on-select, Canvas);
}
.shield {
  position: fixed; inset: 0; z-index: ${ABOVE}; pointer-events: auto; touch-action: none;
}
[data-axis="x"] { cursor: ew-resize; }
[data-axis="y"] { cursor: ns-resize; }
[data-axis="both"] { cursor: nwse-resize; }
.value {
  z-index: ${ABOVE + 1}; transform-origin: 0 0;
  pointer-events: none; padding: 2px 5px; border-radius: 3px; white-space: nowrap;
  font: 600 11px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums; letter-spacing: 0;
  background: var(--kv-select, CanvasText); color: var(--kv-on-select, Canvas);
}
.off { display: none; }
@media (forced-colors: active) {
  .bar { background: Canvas; border-color: Highlight; }
  .value { background: Canvas; color: CanvasText; border: 1px solid CanvasText; }
}
`;
