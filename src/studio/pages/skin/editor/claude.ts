// The Claude tab: requests, variants and their actions.
// Plan 18, task D. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// The status line, the request field (until the ask bar of part 2 takes its place), then each
// request as a box with its variants as boxes of their own under it, never inside it. The chosen
// variant is ringed (`.k-item[data-on]`); Discard and Apply stay in view in the foot. No avatar,
// no sparkle: the words say who did what. The bar's listening status is here too.

export const SKIN_EDITOR_CLAUDE = `
.claude { display: grid; gap: var(--st-space-16); align-content: start; }
.claude-status { display: grid; gap: var(--st-space-8); }
.claude-status-line {
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  font-weight: var(--st-font-weight-medium);
}
.claude-start { display: grid; gap: var(--st-space-4); }
.claude-form { display: grid; gap: var(--st-space-6); }
.claude-label { font-weight: var(--st-font-weight-medium); }
.claude-field { min-height: 64px; }
.claude-form-actions { display: flex; justify-content: flex-end; gap: var(--st-space-6); }
.claude-said:empty { display: none; }
.claude-list { display: grid; gap: var(--st-space-12); align-content: start; }
.claude-title {
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  font-weight: var(--st-font-weight-medium);
}
.claude-group { margin-top: var(--st-space-4); }
.claude-requests { display: grid; gap: var(--st-space-16); margin: 0; padding: 0; list-style: none; }
.claude-request { display: grid; gap: var(--st-space-8); min-width: 0; }
.claude-ask { gap: var(--st-space-6); min-width: 0; }
.claude-ask-head { display: flex; align-items: center; gap: var(--st-space-8); min-width: 0; }
.claude-state {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-6);
  min-width: 0;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.claude-drop { margin-left: auto; min-height: var(--st-size-target); padding: 0 var(--st-space-8); }
.claude-words { overflow-wrap: anywhere; }
.claude-answer { color: var(--st-color-ink-mid); overflow-wrap: anywhere; }
.claude-ask > .k-meta { overflow-wrap: anywhere; }
.claude-stale {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-6) var(--st-space-8);
  padding-top: var(--st-space-6);
  border-top: 1px solid var(--st-color-line);
}
/* A variant: chosen with a click, Enter or Space; pointing at it or focusing it previews it. */
.claude-variant { gap: var(--st-space-8); min-width: 0; cursor: pointer; }
.claude-variant[data-outdated] .claude-variant-label { color: var(--st-color-ink-mid); }
.claude-variant-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--st-space-8);
  min-width: 0;
}
.claude-variant-label { min-width: 0; font-weight: var(--st-font-weight-bold); overflow-wrap: anywhere; }
.claude-variant-head > .k-meta { flex: none; }
.claude-signs { display: flex; flex-wrap: wrap; gap: var(--st-space-4); }
.claude-variant-problem { font-size: var(--st-font-size-sm); overflow-wrap: anywhere; }
.claude-check:empty { display: none; }
.claude-check-line {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.claude-check-line[data-tone] { color: var(--st-color-ink); }
.claude-check-line > span:last-child { min-width: 0; overflow-wrap: anywhere; }
.claude-problems { display: grid; gap: var(--st-space-4); margin: 0; padding: 0; list-style: none; }
/* The foot: what Apply does, Discard and Apply. */
.claude-foot { flex: none; }
.claude-foot-note { margin-right: auto; min-width: 0; }
/* The bar's listening status (\`[data-edit-listening]\`). */
.claude-bar {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-6);
  min-width: 0;
  padding: 0 var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  white-space: nowrap;
}
`;
