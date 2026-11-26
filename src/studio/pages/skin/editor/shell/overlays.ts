// What opens over the editor: the context menu, dialogs, toasts, the shortcuts list.
// Plan 18, task D. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).
//
// Each is a `.k-pop` and enters by itself (`../motion.ts`); this file only places and lays them
// out. The conflict note and a refused edit's note sit above the right panel's panes and rise in.

export const SKIN_EDITOR_OVERLAYS = `
/* The context menu: placed by its script at the pointer, kept on screen. */
.menu-root {
  position: fixed;
  z-index: 70;
  max-width: min(320px, calc(100vw - var(--st-space-16)));
  max-height: calc(100vh - var(--st-space-16));
  overflow: auto;
}
.menu-item { padding-block: var(--st-space-4); }
.menu-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: var(--st-size-icon);
  height: var(--st-size-icon);
  color: var(--st-color-ink-mid);
}
.menu-text { display: grid; flex: 1 1 auto; min-width: 0; white-space: normal; }
.menu-reason { line-height: var(--st-line-height-tight); }
/* Dialogs: a head, the content that scrolls, the actions at the foot. */
.dialog-diff[open], .dialog-keys[open] {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-12);
  overflow: hidden;
}
.dialog-head { gap: var(--st-space-12); min-height: 0; }
.dialog-title { font-size: var(--st-font-size-lg); overflow-wrap: anywhere; }
.dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--st-space-8); }
/* The diff: the two sources side by side, line by line. */
.dialog-diff { width: min(1040px, calc(100vw - var(--st-space-32))); }
.dialog-notes { display: grid; gap: var(--st-space-4); }
.dialog-file { overflow-wrap: anywhere; }
.dialog-blocked { font-size: var(--st-font-size-sm); }
.dialog-diff-rows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised);
  font-family: var(--st-font-mono);
}
.dialog-diff-side {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: var(--st-space-6) var(--st-space-8);
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink-mid);
  font-family: var(--st-font-body);
  font-size: var(--st-font-size-xs);
  font-weight: var(--st-font-weight-medium);
}
.dialog-diff-line {
  display: block;
  min-height: 18px;
  padding: 0 var(--st-space-8);
  font-size: var(--st-font-size-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dialog-diff-line[data-side="current"] { box-shadow: inset 1px 0 0 var(--st-color-line); }
.dialog-diff-line[data-changed="old"] { background: var(--st-color-fix-soft); }
.dialog-diff-line[data-changed="current"] { background: var(--st-color-good-soft); }
.dialog-diff-line[data-changed="none"] { background: var(--st-color-raised-strong); }
/* The list of shortcuts. */
.dialog-keys { width: min(640px, calc(100vw - var(--st-space-32))); }
.dialog-keys-search { flex: none; }
.dialog-keys-list {
  display: grid;
  gap: var(--st-space-16);
  align-content: start;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.dialog-keys-group { display: grid; gap: var(--st-space-4); }
.dialog-keys-rows { margin: 0; padding: 0; list-style: none; }
.dialog-keys-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-12);
  min-height: 30px;
  border-top: 1px solid var(--st-color-line);
}
.dialog-keys-row:first-child { border-top: 0; }
.dialog-keys-keys {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--st-space-4);
}
.dialog-keys-plus { color: var(--st-color-ink-mid); font-size: var(--st-font-size-xs); }
/* A toast over everything else. */
.toast-note { z-index: 80; }
/* A note that stays until the person selects again: over the canvas, at its top. */
.structure-note {
  position: fixed;
  top: calc(var(--st-size-bar) + var(--st-space-16));
  left: 50%;
  z-index: 50;
  translate: -50% 0;
  max-width: min(560px, calc(100vw - var(--st-space-32)));
  margin: 0;
  padding: var(--st-space-8) var(--st-space-12);
}
/* The conflict note, and a refused edit's: above the panes, in the tone of what needs a look. */
.conflict-note, .conflict-ask {
  display: grid;
  flex: none;
  gap: var(--st-space-6);
  margin: var(--st-space-8) var(--st-space-12) 0;
  padding: var(--st-space-10);
  border-radius: var(--st-radius-md);
  background: var(--st-color-review-soft);
}
.conflict-body { display: grid; gap: var(--st-space-6); }
.conflict-body:empty { display: none; }
.conflict-title { font-weight: var(--st-font-weight-bold); }
.conflict-text, .conflict-ask-hint { font-size: var(--st-font-size-sm); overflow-wrap: anywhere; }
.conflict-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--st-space-6); }
.conflict-ask-status:empty { display: none; }
`;
