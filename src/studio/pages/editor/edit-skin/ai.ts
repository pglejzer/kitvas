// The editor's styles: the AI tab (spec 4d, goals 1 and 2; plan 17, task B). The listening line,
// the request form, the requests and a card per variant, whose signs and check follow the live
// findings' tones: dashed review, solid fix, the kit's good colour for a pass. Base kit tokens
// only (`pages/skin.ts` rules).

export const EDIT_SKIN_AI = `
.ai { display: grid; gap: var(--kit-space-lg); min-width: 0; }
.ai-quiet { margin: 0; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.ai-status {
  display: grid;
  gap: var(--kit-space-xs);
  padding: var(--kit-space-sm) var(--kit-space-md);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-md);
  background: var(--kit-color-bg);
}
.ai-status-line {
  display: flex;
  align-items: center;
  gap: var(--kit-space-sm);
  margin: 0;
  font-weight: var(--kit-font-weight-medium);
}
.ai-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-full);
  background: var(--kit-color-surface);
}
.ai-status[data-state="listening"] .ai-dot {
  border-color: var(--kit-color-good);
  background: var(--kit-color-good);
}
.ai-status[data-state="working"] .ai-dot {
  border-color: var(--kit-color-review);
  background: var(--kit-color-review);
}
.ai-start {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-sm);
  margin: 0;
  color: var(--kit-color-ink-mid);
  font-size: var(--kit-font-size-sm);
}
.ai-start[hidden] { display: none; }
.ai-command {
  padding: 0 var(--kit-space-xs);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font-family: var(--kit-font-mono);
  overflow-wrap: anywhere;
}
.ai-button {
  min-height: 24px;
  padding: 0 var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  cursor: pointer;
}
.ai-button:hover:not(:disabled) { background: var(--kit-color-bg); }
.ai-button:disabled { color: var(--kit-color-ink-mid); cursor: default; }
.ai-primary {
  border-color: var(--kit-color-ink);
  background: var(--kit-color-ink);
  color: var(--kit-color-on-ink);
}
.ai-primary:hover:not(:disabled) { background: var(--kit-color-ink); text-decoration: underline; }
.ai-primary:disabled {
  border-color: var(--kit-color-line-strong);
  background: var(--kit-color-surface);
}
.ai-link {
  min-height: 24px;
  margin-left: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--kit-color-ink);
  font: inherit;
  font-size: var(--kit-font-size-sm);
  text-decoration: underline;
  cursor: pointer;
}
.ai-button:focus-visible,
.ai-link:focus-visible,
.ai-field:focus-visible,
.ai-variant:focus-visible { outline: 2px solid var(--kit-color-focus); outline-offset: 2px; }
.ai-form { display: grid; gap: var(--kit-space-xs); margin: 0; }
.ai-label { font-weight: var(--kit-font-weight-medium); }
.ai-field {
  box-sizing: border-box;
  width: 100%;
  min-height: 4.5rem;
  padding: var(--kit-space-xs) var(--kit-space-sm);
  border: 1px solid var(--kit-color-line-strong);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
  color: var(--kit-color-ink);
  font: inherit;
  line-height: var(--kit-line-height-normal);
  resize: vertical;
}
.ai-hint,
.ai-said { margin: 0; color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.ai-said:empty { display: none; }
.ai-actions { display: flex; flex-wrap: wrap; gap: var(--kit-space-sm); }
.ai-list { display: grid; gap: var(--kit-space-sm); min-width: 0; }
.ai-title,
.ai-group {
  margin: 0;
  font-size: var(--kit-font-size-sm);
  font-weight: var(--kit-font-weight-medium);
}
.ai-group { color: var(--kit-color-ink-mid); }
.ai-requests,
.ai-variants,
.ai-problems { margin: 0; padding: 0; list-style: none; }
.ai-requests { display: grid; gap: var(--kit-space-sm); }
.ai-request {
  display: grid;
  gap: var(--kit-space-xs);
  min-width: 0;
  padding: var(--kit-space-sm);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
}
.ai-request[data-status="answered"],
.ai-request[data-status="failed"] { border-color: var(--kit-color-line-strong); }
.ai-request-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--kit-space-xs) var(--kit-space-sm);
}
.ai-kind { font-weight: var(--kit-font-weight-medium); }
.ai-word { color: var(--kit-color-ink-mid); font-size: var(--kit-font-size-sm); }
.ai-request-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.ai-answer { margin: 0; overflow-wrap: anywhere; }
.ai-answer[data-tone="review"] {
  padding-left: var(--kit-space-sm);
  border-left: 2px solid var(--kit-color-review);
}
.ai-variants { display: grid; gap: var(--kit-space-xs); margin-top: var(--kit-space-xs); }
.ai-variant {
  display: grid;
  gap: var(--kit-space-xs);
  justify-items: start;
  min-width: 0;
  padding: var(--kit-space-sm);
  border: 1px solid var(--kit-color-line);
  border-radius: var(--kit-radius-sm);
  background: var(--kit-color-surface);
}
.ai-variant[data-kind="ready"]:not([data-outdated]):hover { border-color: var(--kit-color-ink); }
.ai-variant[data-outdated],
.ai-variant[data-kind="invalid"] { background: var(--kit-color-bg); }
.ai-variant-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--kit-space-xs) var(--kit-space-sm);
}
.ai-variant-label { font-weight: var(--kit-font-weight-medium); overflow-wrap: anywhere; }
.ai-variant-problem { margin: 0; font-size: var(--kit-font-size-sm); overflow-wrap: anywhere; }
.ai-signs { display: flex; flex-wrap: wrap; gap: var(--kit-space-xs); }
.ai-sign {
  padding: 0 var(--kit-space-xs);
  border: 1px dashed var(--kit-color-review);
  border-radius: var(--kit-radius-sm);
  color: var(--kit-color-ink);
  font-size: var(--kit-font-size-sm);
}
.ai-sign[data-tone="quiet"] {
  border: 1px solid var(--kit-color-line-strong);
  color: var(--kit-color-ink-mid);
}
.ai-check {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--kit-space-xs);
  font-size: var(--kit-font-size-sm);
}
.ai-check:empty { display: none; }
.ai-ok { color: var(--kit-color-good); font-weight: var(--kit-font-weight-bold); }
.ai-problems { display: grid; gap: var(--kit-space-xs); }
.ai-problem {
  padding-left: var(--kit-space-sm);
  border-left: 2px dashed var(--kit-color-review);
  overflow-wrap: anywhere;
}
.ai-problem[data-tone="fix"] { border-left-style: solid; border-left-color: var(--kit-color-fix); }
.ai-stale {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--kit-space-xs) var(--kit-space-sm);
}
`;
