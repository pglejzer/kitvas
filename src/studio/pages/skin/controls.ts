// The studio's skin, shared rules: the controls every page and panel builds on (ADR 0057), and the
// bar's own parts (the logo's link, Claude's status, a word that gives way). Studio tokens only.
// The accent is for the primary action, the chosen item, the selection and focus, and nothing
// else (editor-practices 1.5).

export const SKIN_CONTROLS = `
/* A text button. Quiet by default; \`.k-btn-primary\` is the one main action of a view. */
.k-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--st-space-6);
  min-height: var(--st-size-control);
  padding: 0 var(--st-space-10);
  border-radius: var(--st-radius-sm);
  color: var(--st-color-ink-mid);
  font-weight: var(--st-font-weight-medium);
  white-space: nowrap;
  text-decoration: none;
}
.k-btn:hover { background: var(--st-color-raised); color: var(--st-color-ink); }
.k-btn:active { background: var(--st-color-raised-strong); }
.k-btn[aria-pressed="true"], .k-btn[aria-expanded="true"], .k-btn[aria-current] {
  background: var(--st-color-raised);
  color: var(--st-color-ink);
}
.k-btn:disabled, .k-btn[aria-disabled="true"] { opacity: 0.45; }
.k-btn:disabled:hover, .k-btn[aria-disabled="true"]:hover {
  background: none;
  color: var(--st-color-ink-mid);
}
.k-btn-line { color: var(--st-color-ink); box-shadow: inset 0 0 0 1px var(--st-color-line-strong); }
.k-btn-primary, .k-btn-primary:hover, .k-btn-primary:active {
  background: var(--st-color-accent);
  color: var(--st-color-on-accent);
}
.k-btn-primary:hover { opacity: 0.9; }
.k-btn-primary:disabled, .k-btn-primary:disabled:hover {
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink-mid);
  opacity: 1;
}
/* A button that shows only an icon; it always has an accessible name and a title. */
.k-icon-btn {
  display: inline-grid;
  place-items: center;
  width: var(--st-size-control);
  height: var(--st-size-control);
  flex: none;
  border-radius: var(--st-radius-sm);
  color: var(--st-color-ink-mid);
}
.k-icon-btn:hover { background: var(--st-color-raised); color: var(--st-color-ink); }
.k-icon-btn:active { background: var(--st-color-raised-strong); }
.k-icon-btn[aria-pressed="true"], .k-icon-btn[aria-expanded="true"],
.k-icon-btn[aria-selected="true"] {
  background: var(--st-color-accent-soft);
  color: var(--st-color-accent);
}
.k-icon-btn:disabled { opacity: 0.45; }
.k-icon-btn:disabled:hover { background: none; color: var(--st-color-ink-mid); }
/* One of several: buttons or links in a row, the chosen one lifted. */
.k-seg {
  display: inline-flex;
  padding: var(--st-space-2);
  border-radius: calc(var(--st-radius-sm) + var(--st-space-2));
  background: var(--st-color-raised);
}
.k-seg > button, .k-seg > a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--st-space-4);
  min-width: var(--st-size-target);
  min-height: var(--st-size-target);
  padding: 0 var(--st-space-8);
  border-radius: var(--st-radius-sm);
  color: var(--st-color-ink-mid);
  white-space: nowrap;
  text-decoration: none;
}
.k-seg > button:hover, .k-seg > a:hover { color: var(--st-color-ink); }
.k-seg > [aria-pressed="true"], .k-seg > [aria-checked="true"], .k-seg > [aria-selected="true"],
.k-seg > [aria-current] {
  background: var(--st-color-pressed);
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-medium);
  box-shadow: var(--st-shadow-pressed);
}
.k-seg > button:disabled, .k-seg > [aria-disabled="true"] { opacity: 0.45; }
/* A small label of a fact: a kind, a width, a changed value. */
.k-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-4);
  min-height: var(--st-size-chip);
  padding: 0 var(--st-space-6);
  border-radius: calc(var(--st-radius-sm) - 2px);
  background: var(--st-color-raised);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
  white-space: nowrap;
}
.k-item .k-chip, .k-pop .k-chip { background: var(--st-color-raised-strong); }
.k-chip[data-tone="accent"] { background: var(--st-color-accent-soft); color: var(--st-color-accent); }
.k-chip[data-tone="fix"] { background: var(--st-color-fix-soft); color: var(--st-color-fix); }
.k-chip[data-tone="review"] { background: var(--st-color-review-soft); color: var(--st-color-review); }
.k-chip[data-tone="good"] { background: var(--st-color-good-soft); color: var(--st-color-good); }
/* A count beside a label. */
.k-count {
  display: inline-grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 var(--st-space-4);
  border-radius: var(--st-radius-full);
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
}
.k-count[data-tone="fix"] { background: var(--st-color-fix-soft); color: var(--st-color-fix); }
.k-count[data-tone="review"] { background: var(--st-color-review-soft); color: var(--st-color-review); }
/* Text fields, selects and text areas. */
.k-field {
  width: 100%;
  min-height: var(--st-size-control);
  padding: 0 var(--st-space-8);
  border: 0;
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised);
  color: var(--st-color-ink);
}
.k-field:hover, .k-field:focus, .k-field:focus-within { box-shadow: inset 0 0 0 1px var(--st-color-line-strong); }
/* A field made of a box (not an input): a value, an icon or a swatch, and a token name at its end. */
div.k-field, label.k-field { display: flex; align-items: center; gap: var(--st-space-6); min-width: 0; }
.k-field > .k-icon, .k-field > .k-swatch { flex: none; color: var(--st-color-ink-mid); }
/* The name of the token a field's value sits on, at the field's right end: the code font, in the
   quiet ink that passes AA (never the soft grey). */
.k-field-tok {
  flex: none;
  margin-left: auto;
  color: var(--st-color-ink-mid);
  font-family: var(--st-font-mono);
  font-size: var(--st-font-size-xs);
  white-space: nowrap;
}
.k-field::placeholder { color: var(--st-color-ink-mid); opacity: 1; }
.k-field:disabled { opacity: 0.45; }
textarea.k-field { min-height: 64px; padding: var(--st-space-6) var(--st-space-8); resize: vertical; }
.k-item .k-field, .k-pop .k-field { background: var(--st-color-raised-strong); }
/* A field with the search icon in it: \`<label class="k-search">icon<input class="k-field"></label>\`. */
.k-search { position: relative; display: block; }
.k-search > .k-icon {
  position: absolute;
  top: 50%;
  left: var(--st-space-8);
  translate: 0 -50%;
  color: var(--st-color-ink-mid);
  pointer-events: none;
}
.k-search > .k-field { padding-left: calc(var(--st-space-8) + var(--st-size-icon) + var(--st-space-6)); }
/* On and off: \`<input type="checkbox" class="k-switch">\`. */
.k-switch {
  appearance: none;
  position: relative;
  width: 28px;
  height: 16px;
  margin: 0;
  flex: none;
  border-radius: var(--st-radius-full);
  background: var(--st-color-raised-strong);
  cursor: pointer;
}
.k-switch::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: var(--st-radius-full);
  background: var(--st-color-ink-mid);
  transition: translate var(--st-motion-fast) var(--st-ease-out);
}
.k-switch:checked { background: var(--st-color-accent); }
.k-switch:checked::before { translate: 12px 0; background: var(--st-color-on-accent); }
/* A key of a shortcut. */
.k-kbd {
  padding: 0 var(--st-space-4);
  border-radius: calc(var(--st-radius-sm) - 2px);
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
  white-space: nowrap;
}
/* A state dot: grey when off, green when listening, the accent fading in and out when working. */
.k-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: var(--st-radius-full);
  background: var(--st-color-ink-soft);
}
.k-dot[data-state="listening"], .k-dot[data-state="good"] { background: var(--st-color-good); }
.k-dot[data-state="working"] {
  background: var(--st-color-accent);
  animation: k-pulse 1.2s ease-in-out infinite;
}
.k-dot[data-state="fix"] { background: var(--st-color-fix); }
.k-dot[data-state="review"] { background: var(--st-color-review); }
/* The logo of a bar, a link home. */
.k-logo-link {
  display: inline-flex;
  flex: none;
  align-items: center;
  min-height: var(--st-size-control);
  padding: 0 var(--st-space-4);
  border-radius: var(--st-radius-sm);
  color: var(--st-color-ink);
  text-decoration: none;
}
/* Claude's status in a bar: the dot and short words, painted by the page's script; empty when no
   session listens. */
.k-bar-status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--st-space-6);
  padding: 0 var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  white-space: nowrap;
}
.k-bar-status:empty { display: none; }
.k-bar-status-words { white-space: nowrap; }
/* A word beside an icon in a bar (View, More): it gives way in a narrow bar, and still names
   its control for assistive technology. */
.k-bar-word { white-space: nowrap; }
@media (max-width: 40rem) {
  .k-bar-status-words, .k-bar-word {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
}
/* A colour sample. Its colour is set by the rule or the script that knows the value. */
.k-swatch {
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: calc(var(--st-radius-sm) - 2px);
  box-shadow: inset 0 0 0 1px var(--st-color-frame-edge);
}
.k-link { color: var(--st-color-accent); text-decoration: underline; text-underline-offset: 3px; }
/* A command to copy: the text in the code font, and a copy button after it. */
.k-cmd {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  min-height: var(--st-size-control);
  padding: 0 var(--st-space-4) 0 var(--st-space-8);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised);
}
.k-cmd > code { flex: 1; min-width: 0; overflow-wrap: anywhere; }
/* The copy button, for a moment after it copied. */
.k-cmd [data-copy][data-done] { color: var(--st-color-good); }
.k-item .k-cmd { background: var(--st-color-raised-strong); }
/* The studio's select: a trigger that looks like a field, and a list that floats (\`.k-pop\`), placed
   by the script (\`client/studio/ui/select/\`). It holds no text of its own. */
.k-select { display: block; width: 100%; min-width: 0; }
.k-select-trigger {
  display: flex;
  align-items: center;
  gap: var(--st-space-6);
  width: 100%;
  min-height: var(--st-size-control);
  padding: 0 var(--st-space-8);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised);
  color: var(--st-color-ink);
  text-align: left;
  white-space: nowrap;
}
.k-select-trigger:hover, .k-select-trigger:focus-visible, .k-select-trigger[aria-expanded="true"] {
  box-shadow: inset 0 0 0 1px var(--st-color-line-strong);
}
.k-select-trigger:disabled { opacity: 0.45; }
.k-item .k-select-trigger { background: var(--st-color-raised-strong); }
.k-select-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.k-select-trigger > .k-icon { flex: none; color: var(--st-color-ink-mid); }
.k-select-name[data-placeholder] { color: var(--st-color-ink-mid); }
.k-select-detail {
  color: var(--st-color-ink-mid);
  font-family: var(--st-font-mono);
  font-size: var(--st-font-size-sm);
}
.k-select-list {
  position: fixed;
  z-index: 90;
  box-sizing: border-box;
  overflow: auto;
  padding: var(--st-space-4);
  font-size: var(--st-font-size-sm);
}
.k-select-list:focus-visible { outline: none; }
.k-select-search { margin-bottom: var(--st-space-4); }
.k-select-group {
  padding: var(--st-space-6) var(--st-space-8) var(--st-space-2);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
}
.k-select-option {
  display: flex;
  align-items: center;
  gap: var(--st-space-8);
  min-height: var(--st-size-row);
  padding: 0 var(--st-space-8);
  border-radius: var(--st-radius-sm);
  color: var(--st-color-ink);
  white-space: nowrap;
  cursor: pointer;
}
.k-select-option[data-active] { background: var(--st-color-raised-strong); }
.k-select-option[aria-selected="true"] > .k-icon:last-child { color: var(--st-color-accent); }
.k-select-warn { display: inline-grid; color: var(--st-color-review); }
.k-select-sep { height: 1px; margin: var(--st-space-4); background: var(--st-color-line); }
.k-select-none { margin: 0; padding: var(--st-space-8); color: var(--st-color-ink-mid); }
/* Option chips: a few named choices side by side (a button's look: primary, ghost, quiet). Unlike
   \`.k-seg\` (one lifted segment of a joined control) each chip stands alone, and the pressed one
   takes the accent ring and its text. \`<div class="k-opts"><button aria-pressed>\`. */
.k-opts { display: flex; flex-wrap: wrap; gap: var(--st-space-4); }
.k-opts > button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--st-size-target);
  min-height: var(--st-size-target);
  padding: 0 var(--st-space-10);
  border-radius: var(--st-radius-sm);
  background: var(--st-color-raised);
  color: var(--st-color-ink-mid);
  white-space: nowrap;
}
.k-opts > button:hover { color: var(--st-color-ink); }
.k-opts > button[aria-pressed="true"] {
  background: var(--st-color-accent-soft);
  color: var(--st-color-ink);
  font-weight: var(--st-font-weight-bold);
  box-shadow: inset 0 0 0 1px var(--st-color-accent);
}
.k-opts > button:disabled { opacity: 0.45; }
.k-card .k-opts > button, .k-item .k-opts > button { background: var(--st-color-raised-strong); }
.k-card .k-opts > button[aria-pressed="true"], .k-item .k-opts > button[aria-pressed="true"] {
  background: var(--st-color-accent-soft);
}
/* A stepper over a kit's tokens of one kind (radius, size): a track with a stop at each token, the
   handle on the current one, the token's label under each stop (\`sm · 6\`). Each stop is a
   \`button.k-stepper-stop[role="radio"]\` with \`aria-checked\`; the script moves focus with the
   arrow keys. The label is the stop's text. */
.k-stepper { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
.k-stepper-stop {
  position: relative;
  display: block;
  min-width: var(--st-size-target);
  padding: var(--st-size-target) var(--st-space-2) var(--st-space-2);
  overflow: hidden;
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-xs);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.k-stepper-stop::before, .k-stepper-stop::after { content: ""; position: absolute; }
.k-stepper-stop::before {
  top: calc(var(--st-size-target) / 2 - 1px);
  right: 0;
  left: 0;
  height: 2px;
  background: var(--st-color-raised-strong);
}
.k-stepper-stop:first-child::before { left: 50%; }
.k-stepper-stop:last-child::before { right: 50%; }
.k-stepper-stop::after {
  top: calc(var(--st-size-target) / 2);
  left: 50%;
  width: 8px;
  height: 8px;
  translate: -50% -50%;
  border-radius: var(--st-radius-full);
  background: var(--st-color-line-strong);
  transition: background var(--st-motion-fast) var(--st-ease-out);
}
.k-stepper-stop:hover { color: var(--st-color-ink); }
.k-stepper-stop:hover::after { background: var(--st-color-ink-mid); }
.k-stepper-stop[aria-checked="true"] { color: var(--st-color-ink); font-weight: var(--st-font-weight-bold); }
.k-stepper-stop[aria-checked="true"]::after {
  width: 14px;
  height: 14px;
  background: var(--st-color-accent);
  box-shadow: 0 0 0 3px var(--st-color-accent-soft);
}
.k-stepper-stop:focus-visible { outline: none; }
.k-stepper-stop:focus-visible::after { outline: 2px solid var(--st-color-accent); outline-offset: 3px; }
.k-stepper-stop:disabled { opacity: 0.45; }
/* A change, as one line: the property, the old value struck and quiet, the new one in a small
   chip (\`<span class="k-change"><span class="k-change-prop">size</span><del>md</del><ins>lg</ins></span>\`).
   No old value: leave \`del\` out. A long value wraps inside its line. */
.k-change {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--st-space-2) var(--st-space-6);
  min-width: 0;
  max-width: 100%;
  font-size: var(--st-font-size-sm);
}
.k-change-prop { color: var(--st-color-ink-mid); }
.k-change del {
  color: var(--st-color-ink-mid);
  text-decoration: line-through;
  overflow-wrap: anywhere;
}
.k-change del::after {
  content: "\\2192";
  content: "\\2192" / "";
  display: inline-block;
  margin-left: var(--st-space-6);
  text-decoration: none;
}
.k-change ins {
  min-height: var(--st-size-chip);
  padding: 0 var(--st-space-6);
  border-radius: calc(var(--st-radius-sm) - 2px);
  background: var(--st-color-raised-strong);
  color: var(--st-color-ink);
  text-decoration: none;
  overflow-wrap: anywhere;
}
`;
