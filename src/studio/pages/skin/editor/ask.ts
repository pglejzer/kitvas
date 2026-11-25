// The ask bar (redesign spec, goal 10; plan 19; mock v10 lines 169 to 174): at the canvas's bottom
// centre, in Edit only. The page draws the empty form hidden; the script (\`client/studio/edit/ask/\`)
// fills and shows it. Above it, in one column: the commands, the "not listening" line, one line of
// news. Studio tokens only (\`--st-*\`); shared classes are \`../\` (\`k-\`). The bar is a \`.k-pop\`, which
// rises in when shown (and not under reduced motion), so it is placed with \`translate\`, not
// \`transform\`.

export const SKIN_EDITOR_ASK = `
.ask-bar {
  position: absolute;
  bottom: var(--st-space-12);
  left: 50%;
  z-index: 3;
  translate: -50% 0;
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  box-sizing: border-box;
  width: min(470px, calc(100% - 200px));
  height: 42px;
  padding: 0 var(--st-space-6) 0 var(--st-space-12);
  border-radius: var(--st-radius-lg);
  font-size: var(--st-font-size-sm);
}
.ask-bar[hidden] { display: none; }
.ask-bar > .k-dot, .ask-bar > .k-chip, .ask-bar > .k-kbd, .ask-bar > .ask-send { flex: none; }
.ask-chip { max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ask-chip[hidden], .ask-hint[hidden] { display: none; }
.ask-field {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--st-color-ink);
  font: inherit;
  text-overflow: ellipsis;
}
.ask-field::placeholder { color: var(--st-color-ink-mid); opacity: 1; }
.ask-field:disabled { cursor: default; }
.ask-field:focus { outline: none; }
.ask-bar:focus-within { box-shadow: var(--st-shadow-pop), 0 0 0 1px var(--st-color-line-strong); }
.ask-send {
  width: var(--st-size-target);
  height: var(--st-size-target);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-accent);
  color: var(--st-color-on-accent);
}
.ask-send:hover:not(:disabled) { background: var(--st-color-accent); opacity: 0.9; }
.ask-send:disabled { opacity: 0.45; }
.ask-above {
  position: absolute;
  bottom: calc(100% + var(--st-space-8));
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--st-space-6);
}
.ask-list { max-height: 280px; overflow-y: auto; }
.ask-list[hidden], .ask-options[hidden], .ask-empty[hidden] { display: none; }
.ask-option { cursor: pointer; }
.ask-option[aria-disabled="true"] { cursor: default; }
.ask-option-icon { display: inline-flex; flex: none; width: var(--st-size-icon); }
.ask-option-text { display: flex; flex-direction: column; min-width: 0; }
.ask-option-reason { white-space: normal; }
.ask-empty { margin: 0; padding: var(--st-space-8); }
.ask-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--st-space-6) var(--st-space-8);
  padding: var(--st-space-6) var(--st-space-8) var(--st-space-6) var(--st-space-12);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
}
.ask-note[hidden] { display: none; }
.ask-note-code { color: var(--st-color-ink); font-family: var(--st-font-mono); }
.ask-copy { margin-left: auto; }
.ask-news {
  align-self: center;
  margin: 0;
  padding: var(--st-space-4) var(--st-space-8);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-pop);
  box-shadow: var(--st-shadow-pop);
  color: var(--st-color-ink);
}
.ask-news[hidden] { display: none; }
[data-mode="preview"] .ask-bar { display: none; }
`;
