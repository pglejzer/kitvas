// The Why pane: a card per section with its reasons and guideline ids.
// Plan 18, task B. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).

export const SKIN_EDITOR_WHY = `
.why-head > .k-head { min-height: 0; }
.why-scroll { padding: 0 var(--st-space-12) var(--st-space-12); }
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
.why-lines { display: grid; gap: var(--st-space-6); margin: 0; padding: 0; list-style: none; }
.why-lines > li { color: var(--st-color-ink-mid); }
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
.why-note { padding: var(--st-space-16) 0; }
`;
