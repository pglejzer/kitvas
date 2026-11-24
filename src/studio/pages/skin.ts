// The studio's look: the Base kit's tokens, then the rules that use them. Colours, type and
// spacing come only from the tokens; the few plain numbers are layout (the thumbnail's scale,
// the focus ring, the 24 px targets).

import { type FlatToken, tokensToCss } from '../../kit/index.ts';
import { EDIT_SKIN_RULES } from './edit-skin/index.ts';

export const SKIN_RULES = `
*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: light; }
body {
  margin: 0;
  padding: var(--kit-space-2xl) var(--kit-space-3xl) var(--kit-space-3xl);
  background: var(--kit-color-bg);
  color: var(--kit-color-ink);
  font-family: var(--kit-font-body);
  font-size: var(--kit-font-size-md);
  line-height: var(--kit-line-height-normal);
}
a { color: inherit; }
:focus-visible {
  outline: 2px solid var(--kit-color-focus);
  outline-offset: 2px;
  border-radius: var(--kit-radius-sm);
}
h1 {
  margin: 0 0 var(--kit-space-md);
  font-size: var(--kit-font-size-3xl);
  line-height: var(--kit-line-height-tight);
  letter-spacing: -0.025em;
  font-weight: var(--kit-font-weight-bold);
  overflow-wrap: anywhere;
}
h2 {
  margin: 0 0 var(--kit-space-sm);
  font-size: var(--kit-font-size-md);
  line-height: var(--kit-line-height-snug);
  font-weight: var(--kit-font-weight-medium);
}
p { margin: 0 0 var(--kit-space-xs); }
code { font-family: var(--kit-font-mono); }
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xl);
  margin-bottom: var(--kit-space-3xl);
}
.top nav { display: flex; gap: var(--kit-space-xl); }
.mark { font-weight: var(--kit-font-weight-medium); text-decoration: none; }
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-xl);
  margin: 0 0 var(--kit-space-xs);
}
.label { min-width: 4.5rem; color: var(--kit-color-ink-mid); }
.opt {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  color: var(--kit-color-ink-mid);
  text-decoration: none;
}
.opt:hover { color: var(--kit-color-ink); text-decoration: underline; text-underline-offset: 3px; }
.opt[aria-current] { color: var(--kit-color-ink); font-weight: var(--kit-font-weight-medium); }
.quiet { color: var(--kit-color-ink-mid); }
.fix { color: var(--kit-color-fix); }
.review { color: var(--kit-color-review); }
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, 256px);
  gap: var(--kit-space-2xl) var(--kit-space-xl);
  margin: var(--kit-space-2xl) 0 0;
  padding: 0;
  list-style: none;
}
.card { position: relative; }
.thumb {
  width: 256px;
  height: 210px;
  overflow: hidden;
  /* A prototype on the same ground as the studio still shows where it ends. */
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
}
.thumb iframe {
  width: 1280px;
  height: 1050px;
  border: 0;
  transform: scale(0.2);
  transform-origin: 0 0;
}
.kind {
  margin: var(--kit-space-sm) 0 0;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.original-shot {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-lg);
  background: var(--kit-color-surface);
}
.pick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-xl);
  min-height: 24px;
  margin-bottom: var(--kit-space-sm);
}
.card h2 { margin: var(--kit-space-sm) 0 0; }
.card h2 a { text-decoration: none; }
.card h2 a::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--kit-radius-md);
}
.card h2 a:focus-visible { outline: none; }
.card h2 a:focus-visible::after { outline: 2px solid var(--kit-color-focus); outline-offset: 4px; }
.card:hover h2 a { text-decoration: underline; text-underline-offset: 3px; }
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--kit-space-md);
  margin: 0;
  color: var(--kit-color-ink-mid);
}
.stage { min-width: 0; }
.frame-box { max-width: 100%; overflow-x: auto; }
.frame-box iframe {
  display: block;
  height: 75vh;
  min-height: 32rem;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-lg);
  background: var(--kit-color-surface);
}
.caption {
  margin-top: var(--kit-space-sm);
  text-align: center;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.compare {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--kit-space-xl);
}
.compare .pane { min-width: 0; max-width: 100%; }
.compare-summary { margin-top: var(--kit-space-md); color: var(--kit-color-ink-mid); }
.list { margin: 0 0 var(--kit-space-xl); padding: 0; list-style: none; }
.note {
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr);
  margin-bottom: var(--kit-space-md);
}
.num { font-weight: var(--kit-font-weight-medium); }
.note small {
  display: block;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.note details {
  margin-top: var(--kit-space-xs);
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.note summary { min-height: 24px; cursor: pointer; }
.next { margin-top: var(--kit-space-xl); }
h3 {
  margin: var(--kit-space-xl) 0 var(--kit-space-sm);
  font-size: var(--kit-font-size-md);
  font-weight: var(--kit-font-weight-medium);
  overflow-wrap: anywhere;
}
h4 {
  margin: var(--kit-space-lg) 0 var(--kit-space-xs);
  font-size: var(--kit-font-size-sm);
  font-weight: var(--kit-font-weight-medium);
  color: var(--kit-color-ink-mid);
}
.kit-part { margin-top: var(--kit-space-3xl); }
.kit-list, .tokens, .plain { margin: 0 0 var(--kit-space-xl); padding: 0; list-style: none; }
.kit-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-xl);
  min-height: 24px;
  margin-bottom: var(--kit-space-sm);
}
.token {
  display: grid;
  grid-template-columns: 24px minmax(10rem, 22rem) minmax(0, 1fr);
  align-items: center;
  gap: var(--kit-space-md);
  margin-bottom: var(--kit-space-xs);
  overflow-wrap: anywhere;
}
.swatch {
  display: block;
  width: 24px;
  height: 24px;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
}
.group-label {
  margin: var(--kit-space-2xl) 0 0;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.component { margin-bottom: var(--kit-space-2xl); }
.scroll { max-width: 100%; overflow-x: auto; margin: var(--kit-space-sm) 0; }
.scroll table { border-collapse: collapse; min-width: 32rem; }
.scroll th, .scroll td {
  padding: var(--kit-space-xs) var(--kit-space-lg) var(--kit-space-xs) 0;
  border-bottom: 1px solid var(--kit-color-line);
  text-align: left;
  font-weight: var(--kit-font-weight-regular);
  vertical-align: top;
}
.scroll thead th { color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.example { margin: 0 0 var(--kit-space-md); }
.example figcaption { color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.example pre {
  margin: var(--kit-space-xs) 0 0;
  padding: var(--kit-space-md);
  overflow-x: auto;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
  font-size: var(--kit-font-size-sm);
}
/* The script on the kit page sets the height from what the example reports; 96px is the start. */
.example-frame {
  display: block;
  /* The height the example reports is its own content; the border goes outside it. */
  box-sizing: content-box;
  width: calc(100% - 2px);
  height: 96px;
  margin: var(--kit-space-xs) 0 0;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
}
.example-pair { display: grid; gap: var(--kit-space-md); align-items: start; }
.example-ref {
  display: block;
  max-width: 100%;
  height: auto;
  margin: var(--kit-space-xs) 0 0;
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-surface);
}
/* The paused view (ADR 0042) takes the page's place once the studio has stopped. */
body[data-paused] > :not(.paused) { display: none; }
.paused { max-width: 40rem; padding: var(--kit-space-md) var(--kit-space-lg); }
/* The script moves focus here: the ring shows where it went, for mouse users too. */
.paused:focus {
  outline: 2px solid var(--kit-color-focus);
  outline-offset: 4px;
  border-radius: var(--kit-radius-sm);
}
@media (min-width: 900px) {
  .example-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 40rem) {
  body { padding: var(--kit-space-xl) var(--kit-space-lg); }
  h1 { font-size: var(--kit-font-size-2xl); }
}
`;

/** The style sheet of every studio page. */
export function studioSkin(tokens: FlatToken[]): string {
  return `${tokensToCss(tokens)}${SKIN_RULES}${EDIT_SKIN_RULES}`;
}
