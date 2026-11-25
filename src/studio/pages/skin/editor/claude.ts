// The Claude tab: requests, variants and their actions.
// Plan 18, task D; plan 18f, task 3 (mock v10: Claude 964-993, CSS 295-316 and 561-592). Studio
// tokens only (`--st-*`); shared classes are `../` (`k-`): `.k-card` for every card (with the
// accent ring `data-on` for the chosen variant), `.k-card-meta`, `.k-change`.
//
// The status line with the open count, then each open request as a card with its variants as
// cards of their own under it, never inside it, then "Earlier": one compact row per finished
// request with its end at the right. Discard and Apply stay in view in the foot. No avatar, no
// sparkle: the words say who did what. The bar's listening status is here too. Plan 19, task 4:
// the tab has no field; with no requests one quiet line sends the person to the ask bar.

export const SKIN_EDITOR_CLAUDE = `
.claude {
  display: grid;
  gap: var(--st-space-12);
  align-content: start;
  padding: var(--st-space-12) 0 var(--st-space-14);
}
.claude-status, .claude-empty { padding: 0 var(--st-space-14); }
.claude-status { display: grid; gap: var(--st-space-8); }
.claude-status-line {
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  font-weight: var(--st-font-weight-medium);
}
.claude-status-sub { font-weight: var(--st-font-weight-regular); }
.claude-status-sub::before {
  content: "\\00B7";
  content: "\\00B7" / "";
  margin-right: var(--st-space-6);
}
.claude-start { display: grid; gap: var(--st-space-4); }
.claude-empty { margin: 0; }
.claude-list { display: grid; gap: var(--st-space-12); align-content: start; }
.claude-group { margin: var(--st-space-4) var(--st-space-14) 0; }
.claude-requests { display: grid; gap: var(--st-space-12); margin: 0; padding: 0; list-style: none; }
.claude-request { display: grid; gap: var(--st-space-8); min-width: 0; }
/* The open request: the element and when, the person's words, its state. */
.claude-ask { gap: var(--st-space-8); }
.claude-ask-first { justify-content: space-between; }
.claude-ask-about {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-6);
  min-width: 0;
  color: var(--st-color-ink);
  font-size: var(--st-font-size-sm);
  font-weight: var(--st-font-weight-medium);
}
.claude-ask-about > .k-icon { flex: none; color: var(--st-color-ink-mid); }
.claude-ask-time { flex: none; }
.claude-words { overflow-wrap: anywhere; }
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
.claude-answer { color: var(--st-color-ink-mid); overflow-wrap: anywhere; }
.claude-stale {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-6) var(--st-space-8);
  padding-top: var(--st-space-6);
  border-top: 1px solid var(--st-color-line);
}
/* A variant: chosen with a click, Enter or Space; pointing at it or focusing it previews it. */
.claude-variants { display: grid; gap: var(--st-space-8); margin: 0; padding: 0; list-style: none; }
.claude-variant { gap: var(--st-space-8); cursor: pointer; }
.claude-variant:focus-visible { outline: 2px solid var(--st-color-accent); outline-offset: 2px; }
.claude-variant[data-outdated] .claude-variant-label { color: var(--st-color-ink-mid); }
.claude-variant-head { display: flex; align-items: center; gap: var(--st-space-10); min-width: 0; }
.claude-variant-head > .k-meta { flex: none; margin-left: auto; }
.claude-num {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: calc(var(--st-radius-sm) + 1px);
  background: var(--st-color-raised-strong);
  font-size: var(--st-font-size-xs);
  font-weight: var(--st-font-weight-bold);
}
.claude-variant[data-on] .claude-num { background: var(--st-color-accent); color: var(--st-color-on-accent); }
.claude-variant-title { display: grid; min-width: 0; }
.claude-variant-label { min-width: 0; font-weight: var(--st-font-weight-bold); overflow-wrap: anywhere; }
.claude-variant-state { color: var(--st-color-ink-mid); font-size: var(--st-font-size-xs); }
.claude-variant-state:empty { display: none; }
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
/* Earlier: a compact row per finished request, its end at the right. */
.claude-earlier-title {
  margin: var(--st-space-4) var(--st-space-14) calc(-1 * var(--st-space-4));
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  font-weight: var(--st-font-weight-medium);
}
.claude-earlier { display: grid; gap: var(--st-space-6); margin: 0; padding: 0; list-style: none; }
.claude-past {
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  padding: var(--st-space-8) var(--st-space-12);
}
.claude-past-text { display: grid; flex: 1; min-width: 0; }
.claude-past-words {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.claude-past-on { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.claude-past-end {
  flex: none;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
/* The foot: what Apply does, Discard and Apply. */
.claude-foot { flex: none; }
.claude-foot-note { margin-right: auto; min-width: 0; }
@media (prefers-reduced-motion: no-preference) {
  .claude-num { transition: background var(--st-motion-fast) var(--st-ease-out); }
}
`;
