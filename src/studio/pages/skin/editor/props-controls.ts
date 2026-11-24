// Properties: the controls in a row (fields, segments, the box model, colours).
// Plan 18, task C. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The controls are the shared ones (`.k-field`, `.k-seg`, `.k-switch`, `.k-swatch`); these rules
// only fit them into a row. The box model is a drawing, not a card: margin a dashed outline,
// padding the one fill inside it, the element a hairline; the picked sides in the accent.

export const SKIN_EDITOR_PROPS_CONTROLS = `
/* Fields and lists fill the control's column; a switch and a segmented row keep their size. */
.props-select { min-width: 0; text-overflow: ellipsis; }
.props-number, .props-raw-value { font-variant-numeric: tabular-nums; }
.props-toggle { justify-self: start; }
.props-static { min-width: 0; color: var(--st-color-ink); overflow-wrap: anywhere; }

/* The token picker: a colour's swatch and the kit's tokens, and under them the raw value. */
.props-picker { display: grid; gap: var(--st-space-4); min-width: 0; }
.props-pick-line { display: flex; align-items: center; gap: var(--st-space-6); min-width: 0; }
.props-pick-line > .props-select { flex: 1 1 auto; }
.props-raw { display: flex; flex-wrap: wrap; gap: var(--st-space-4); min-width: 0; }
.props-raw-value { flex: 1 1 64px; width: auto; min-width: 0; font-family: var(--st-font-mono); }
.props-raw-unit { flex: none; width: auto; }
.props-raw-value[aria-invalid="true"] { box-shadow: inset 0 0 0 1px var(--st-color-fix); }
.props-raw > .props-error { flex-basis: 100%; }

/* Keywords: words, or icons when every keyword has one. A row of words wraps when it must. */
.props-words, .props-icons { justify-self: start; max-width: 100%; }
.props-words { flex-wrap: wrap; }
.props-words > button { padding: 0 var(--st-space-6); font-size: var(--st-font-size-sm); }
.props-icons > button { width: 32px; padding: 0; }
/* Nothing is set: the keyword the frame computes is outlined, never filled. */
.props-words > [data-computed]:not(:focus-visible),
.props-icons > [data-computed]:not(:focus-visible) {
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

/* The box model: margin around padding around the element, a value per side. */
.props-boxmodel {
  display: grid;
  gap: var(--st-space-8);
  padding: var(--st-space-4) 0 var(--st-space-6);
}
.props-layer {
  display: grid;
  grid-template-columns: minmax(32px, auto) minmax(0, 1fr) minmax(32px, auto);
  grid-template-areas: "name top ." "left core right" ". bottom .";
  align-items: center;
  justify-items: center;
  gap: var(--st-space-2);
  padding: var(--st-space-4);
  border-radius: var(--st-radius-md);
}
.props-layer[data-layer="margin"] { border: 1px dashed var(--st-color-line-strong); }
.props-layer[data-layer="padding"] {
  grid-area: core;
  width: 100%;
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised);
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
}
.props-side[data-side="top"] { grid-area: top; }
.props-side[data-side="right"] { grid-area: right; }
.props-side[data-side="bottom"] { grid-area: bottom; }
.props-side[data-side="left"] { grid-area: left; }
.props-side:hover { background: var(--st-color-raised); }
.props-layer[data-layer="padding"] > .props-side:hover { background: var(--st-color-raised-strong); }
.props-side[aria-pressed="true"], .props-layer > .props-side[aria-pressed="true"]:hover {
  background: var(--st-color-accent);
  color: var(--st-color-on-accent);
}
.props-core {
  grid-area: core;
  width: 100%;
  min-height: 20px;
  border-radius: calc(var(--st-radius-sm) - 2px);
  box-shadow: inset 0 0 0 1px var(--st-color-line-strong);
}
.props-link { justify-self: start; }
.props-link > button { padding: 0 var(--st-space-6); font-size: var(--st-font-size-sm); }
`;
