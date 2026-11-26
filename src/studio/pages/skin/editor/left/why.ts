// The Why pane: a card per section with its reasons and guideline ids (mock v10, "why").
// Plan 18, task B; plan 18f, task 1. Studio tokens only (`--st-*`); the card is the shared
// `.k-card` (`../`), which brings its own side margin.

export const SKIN_EDITOR_WHY = `
.why-head > .k-head { min-height: 0; }
.why-scroll { padding: 0 0 var(--st-space-12); }
.why-list { padding: 0; }
.why-name {
  justify-self: start;
  max-width: 100%;
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-bold);
  text-align: left;
  overflow-wrap: anywhere;
}
.why-name:disabled { cursor: default; }
.why-name:not(:disabled):hover { text-decoration: underline; text-underline-offset: 3px; }
.why-line { margin: 0; color: var(--st-color-ink-mid); overflow-wrap: anywhere; }
.why-line > em { color: var(--st-color-ink); font-style: normal; font-weight: var(--st-font-weight-bold); }
.why-by { color: var(--st-color-ink-mid); font-size: var(--st-font-size-xs); }
.why-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-6);
  padding-top: var(--st-space-8);
  border-top: 1px solid var(--st-color-line);
}
.why-guidelines { display: flex; flex-wrap: wrap; gap: var(--st-space-4); }
.why-stale { margin-left: auto; }
.why-ask { justify-self: start; }
.why-asked { margin: 0; }
.why-note { padding: var(--st-space-16) var(--st-space-12); }
`;
