// Properties: the controls in a row (fields, chips, segments, the stepper, swatches, the box).
// Plan 18, task C; plan 18f, task 2 (mock v10). Studio tokens only (`--st-*`); shared classes are
// `../` (`k-`).
//
// The controls are the shared ones (`.k-field`, `.k-opts`, `.k-seg`, `.k-switch`, `.k-stepper`,
// `.k-swatch`, `.k-chip`); these rules only fit them into a row. The box model is margin around
// padding around the element's size, each a fill step lighter or darker than the one around it,
// the picked sides in the accent.

export const SKIN_EDITOR_PROPS_CONTROLS = `
/* Fields and lists fill the control's column; a switch and a segmented row keep their size. */
.props-select { min-width: 0; text-overflow: ellipsis; }
.props-number { font-variant-numeric: tabular-nums; }
.props-toggle { justify-self: start; }
.props-static { min-width: 0; color: var(--st-color-ink); overflow-wrap: anywhere; }
/* A value not edited here: the lock, the value in the code font; why is its tooltip. */
.props-locked {
  justify-self: start;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  cursor: default;
}
.props-locked > .k-icon { flex: none; }
.props-locked > code { color: var(--st-color-ink); font-size: inherit; }

/* The token picker: a colour's swatch and the kit's tokens, and under them the raw value. */
.props-picker { display: grid; gap: var(--st-space-4); min-width: 0; }
.props-pick-line { display: flex; align-items: center; gap: var(--st-space-6); min-width: 0; }
.props-pick-line > .props-select { flex: 1 1 auto; }

/* "Custom": a number under the list (a length, a weight, a line height), in the control column.
   One field with its unit at the right end; under it the off-kit line, or the reason. */
.props-num-editor { display: grid; gap: var(--st-space-4); min-width: 0; }
.props-num-editor[hidden], .props-colour[hidden], .props-nearest[hidden] { display: none; }
.props-num {
  display: flex;
  align-items: center;
  min-width: 0;
  height: var(--st-size-control);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised);
}
.props-num:hover { box-shadow: inset 0 0 0 1px var(--st-color-line-strong); }
.props-num:focus-within { box-shadow: inset 0 0 0 1px var(--st-color-accent); }
.props-num[data-invalid="true"] { box-shadow: inset 0 0 0 1px var(--st-color-fix); }
.props-num > .props-num-value, .props-num > .props-num-value:hover, .props-num > .props-num-value:focus {
  flex: 1 1 auto;
  min-width: 0;
  background: transparent;
  box-shadow: none;
  font-variant-numeric: tabular-nums;
}
.props-num-unit { flex: none; width: auto; }
.props-num-unit .k-select-trigger, .props-num-unit .k-select-trigger:hover {
  width: auto;
  background: transparent;
  box-shadow: none;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
/* "Off kit · nearest <token>" and its button, under a number or the colour panel. */
.props-nearest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-4) var(--st-space-6);
  color: var(--st-color-review);
  font-size: var(--st-font-size-sm);
}
.props-use {
  padding: 0;
  color: var(--st-color-ink);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.props-warn { color: var(--st-color-review); font-size: var(--st-font-size-sm); }

/* The colour panel: the whole row wide, in the pop tone. The sizes of its parts are all here
   (the owner's mock, 2026-11-25): the square, the two tracks, the round handles. The colours of
   the square and the tracks are canvases painted by script; nothing here paints them. */
.props-colour {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: var(--st-space-8);
  min-width: 0;
  margin: var(--st-space-2) 0 var(--st-space-8);
  padding: var(--st-space-8);
}
.props-cp-square, .props-cp-track {
  position: relative;
  touch-action: none;
  cursor: pointer;
}
.props-cp-square { height: 132px; border-radius: var(--st-radius-sm); cursor: crosshair; }
.props-cp-track { height: 12px; border-radius: var(--st-radius-full); }
.props-cp-canvas {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
}
.props-cp-knob {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: var(--st-radius-full);
  box-shadow: 0 0 0 2px var(--st-color-ink), 0 0 0 3px var(--st-color-pop);
  pointer-events: none;
}
.props-cp-square > .props-cp-knob { top: 0; }
.props-cp-square:focus-visible, .props-cp-track:focus-visible { outline-offset: 2px; }
.props-cp-row { display: flex; align-items: center; gap: var(--st-space-8); min-width: 0; }
.props-cp-tracks { flex: 1 1 auto; display: grid; gap: var(--st-space-8); min-width: 0; }
.props-cp-field { flex: 1 1 auto; min-width: 0; }
.props-cp-pct { flex: none; width: 62px; }
.props-cp-swatch { width: 14px; height: 14px; border-radius: 4px; }
.props-cp-input {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--st-color-ink);
  font-family: var(--st-font-mono);
  font-size: var(--st-font-size-sm);
  outline: none;
}
.props-cp-unit { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); }
.props-cp-input[aria-invalid="true"] { color: var(--st-color-fix); }

/* The kit's own control of a token row: a stepper or swatches, the typed field under it. */
.props-kit { display: grid; gap: var(--st-space-6); min-width: 0; }
/* Nothing set: the stop the frame computes shows its mark, never checked. */
.props-stepper > [data-computed]:not([aria-checked="true"])::after {
  background: var(--st-color-ink-mid);
}
.props-stepper > [data-warn] { color: var(--st-color-review); }
.props-swatches { display: flex; flex-wrap: wrap; gap: var(--st-space-2); min-width: 0; }
.props-swatch {
  display: inline-grid;
  place-items: center;
  width: var(--st-size-target);
  height: var(--st-size-target);
  border-radius: var(--st-radius-full);
}
.props-swatch > .k-swatch {
  width: var(--st-size-chip);
  height: var(--st-size-chip);
  border-radius: var(--st-radius-full);
}
.props-swatch:hover { background: var(--st-color-raised); }
.props-swatch[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--st-color-accent); }
.props-swatch:focus-visible { outline-offset: 0; border-radius: var(--st-radius-full); }

/* Option chips of an enum prop, and keywords: words, or icons when every keyword has one. */
.props-chips { min-width: 0; }
.props-chips > button { font-size: var(--st-font-size-sm); }
.props-words, .props-icons { justify-self: start; max-width: 100%; }
.props-words { flex-wrap: wrap; }
.props-words > button { padding: 0 var(--st-space-8); font-size: var(--st-font-size-sm); }
.props-icons > button { width: 32px; padding: 0; }
/* Nothing is set: the value in force (what the frame computes, a prop's default) is outlined,
   never filled. */
.props-words > [data-computed]:not(:focus-visible),
.props-icons > [data-computed]:not(:focus-visible),
.props-chips > [data-computed]:not(:focus-visible) {
  outline: 1px dashed var(--st-color-line-strong);
  outline-offset: -2px;
}

/* A background image: the list of the version's files, and Upload after it. */
.props-picture {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-4);
  min-width: 0;
}
.props-picture > .props-select { flex: 1 1 96px; width: auto; }

/* The box model: margin around padding around the element's size, a value per side. */
.props-boxmodel {
  display: grid;
  gap: var(--st-space-8);
  padding: var(--st-space-2) 0 var(--st-space-6);
}
.props-layer {
  display: grid;
  grid-template-columns: minmax(32px, auto) minmax(0, 1fr) minmax(32px, auto);
  grid-template-areas: "name top ." "left core right" ". bottom .";
  align-items: center;
  justify-items: center;
  gap: var(--st-space-2);
  padding: var(--st-space-4);
  border-radius: var(--st-radius-sm);
}
.props-layer[data-layer="margin"] { background: var(--st-color-raised); }
.props-layer[data-layer="padding"] {
  grid-area: core;
  width: 100%;
  background: var(--st-color-raised-strong);
}
.props-layer-name {
  grid-area: name;
  justify-self: start;
  padding-left: var(--st-space-4);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
}
.props-side {
  min-width: 32px;
  min-height: var(--st-size-target);
  padding: 0 var(--st-space-4);
  border-radius: calc(var(--st-radius-sm) - 2px);
  color: var(--st-color-ink);
  font-size: var(--st-font-size-sm);
  font-variant-numeric: tabular-nums;
}
.props-side[data-side="top"] { grid-area: top; }
.props-side[data-side="right"] { grid-area: right; }
.props-side[data-side="bottom"] { grid-area: bottom; }
.props-side[data-side="left"] { grid-area: left; }
.props-side:hover { background: var(--st-color-raised-strong); }
.props-layer[data-layer="padding"] > .props-side:hover { background: var(--st-color-pressed); }
.props-side[aria-pressed="true"], .props-layer > .props-side[aria-pressed="true"]:hover {
  background: var(--st-color-accent);
  color: var(--st-color-on-accent);
}
/* The element itself: its size, on the panel's ground. */
.props-core {
  grid-area: core;
  display: grid;
  place-items: center;
  width: 100%;
  min-height: var(--st-size-target);
  border-radius: calc(var(--st-radius-sm) - 2px);
  background: var(--st-color-panel);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
  font-variant-numeric: tabular-nums;
}
.props-link { justify-self: start; }
.props-link > button { padding: 0 var(--st-space-6); font-size: var(--st-font-size-sm); }
`;
