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
.props-number, .props-raw-value { font-variant-numeric: tabular-nums; }
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
.props-raw { display: flex; flex-wrap: wrap; gap: var(--st-space-4); min-width: 0; }
.props-raw-value { flex: 1 1 64px; width: auto; min-width: 0; font-family: var(--st-font-mono); }
.props-raw-unit { flex: none; width: auto; }
.props-raw-value[aria-invalid="true"] { box-shadow: inset 0 0 0 1px var(--st-color-fix); }
.props-raw > .props-error { flex-basis: 100%; }

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
