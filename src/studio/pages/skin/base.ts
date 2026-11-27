// The studio's skin, part 1 of the shared rules (ADR 0057): the page itself, type, focus and the
// few helpers every page uses. Every colour, size and time is a studio token (`--st-*`, from
// `src/studio/theme/`); a rule never writes a colour by hand. `ink-soft` is for marks only,
// never for text (it fails WCAG AA).

export const SKIN_BASE = `
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html { height: 100%; }
body {
  margin: 0;
  min-height: 100%;
  background: var(--st-color-canvas);
  color: var(--st-color-ink);
  font-family: var(--st-font-body);
  font-size: var(--st-font-size-md);
  font-weight: var(--st-font-weight-regular);
  line-height: var(--st-line-height-normal);
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4, p, figure { margin: 0; }
h1 { font-size: var(--st-font-size-xl); font-weight: var(--st-font-weight-bold); }
h2 { font-size: var(--st-font-size-lg); font-weight: var(--st-font-weight-bold); }
h3, h4 { font-size: var(--st-font-size-md); font-weight: var(--st-font-weight-bold); }
h1, h2 { line-height: var(--st-line-height-tight); overflow-wrap: anywhere; }
a { color: inherit; }
button, input, select, textarea { font: inherit; color: inherit; }
button { margin: 0; padding: 0; border: 0; background: none; cursor: pointer; }
button:disabled { cursor: default; }
code, kbd, pre { font-family: var(--st-font-mono); font-size: var(--st-font-size-sm); }
::selection { background: var(--st-color-accent-soft); }
/* Scrollbars: a thin thumb in the line colour, no track and no arrows. Where the browser draws
   them from these parts it does; elsewhere the two standard properties say the same. */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-button { display: none; }
::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 5px;
  background: var(--st-color-line-strong);
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background-color: var(--st-color-ink-soft); }
@supports not selector(::-webkit-scrollbar) {
  * { scrollbar-width: thin; scrollbar-color: var(--st-color-line-strong) transparent; }
}
:focus-visible {
  outline: 2px solid var(--st-color-accent);
  outline-offset: 2px;
  border-radius: var(--st-radius-sm);
}
/* The icon sprite takes no room; an icon is 16 px of stroke in the text's colour. */
.k-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
.k-icon {
  width: var(--st-size-icon);
  height: var(--st-size-icon);
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* Text helpers. */
.k-quiet { color: var(--st-color-ink-mid); }
.k-meta { color: var(--st-color-ink-mid); font-size: var(--st-font-size-xs); }
.k-fix { color: var(--st-color-fix); }
.k-review { color: var(--st-color-review); }
.k-good { color: var(--st-color-good); }
.k-mono { font-family: var(--st-font-mono); font-size: var(--st-font-size-sm); }
.k-clip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* For assistive technology only. */
.k-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* A pane is a column that fills its panel and never scrolls itself (the editor body sets
   that); this is the one part of it that scrolls, between an optional head and foot. */
.k-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.k-pad { padding: var(--st-space-12); }
/* A page that is no editor screen: its content under the bar. */
.k-page { padding: var(--st-space-24); }
@media (max-width: 40rem) {
  .k-page { padding: var(--st-space-16); }
}
`;
