// The editor's styles for the Why tab and for the library suggestion in the properties header
// (spec 4d, goals 6 and 7; plan 17, task E). Base kit tokens only (`pages/skin.ts` rules).

export const EDIT_SKIN_WHY = `
.why-list { display: grid; gap: var(--kit-space-sm); margin: 0; padding: 0; list-style: none; }
.why-item {
  display: grid;
  gap: var(--kit-space-xs);
  min-width: 0;
  padding: var(--kit-space-sm);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
}
.why-name {
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--kit-color-ink);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.why-name:disabled { cursor: default; }
.why-name:not(:disabled):hover { text-decoration: underline; }
.why-lines { display: grid; gap: var(--kit-space-xs); margin: 0; padding-left: var(--kit-space-lg); }
.why-lines li { overflow-wrap: anywhere; }
.why-stale { color: var(--kit-color-review); }
.why-ask,
.props-suggest-button {
  justify-self: start;
  min-height: 24px;
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
.why-ask:hover,
.props-suggest-button:hover { background: var(--kit-color-bg); }
.props-suggest {
  display: grid;
  gap: var(--kit-space-xs);
  margin-top: var(--kit-space-xs);
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-bg);
}
.props-suggest > .props-note { margin: 0; }
`;
