# 0054. The editor screen

Date: 2026-11-24. Status: accepted. Spec: `docs/specs/2026-11-24-kitvas-editor-screen-design.md`. Builds on ADRs 0048 to 0053. Changes the zoom range of ADR 0053 (25 % to 200 % becomes 10 % to 400 %) and the zoom keys of stage 4b.

## Context

Stages 4a and 4b built the editor's functions, but the screen was a scrolling draft page with every panel stacked in one column under a toggle. The owner tried it and could not find his way. The aim is a screen that reads as an editor: structure on the left, the canvas in the middle, properties on the right, with the usual editor conventions.

## Decision

- **One screen, two modes.** The draft page is the editor screen. A segmented control in the top bar switches Preview and Edit; the layout does not change between them. Edit is disabled, with its reason as the tooltip, for an older version, an unbuilt one, or while comparing. The mode is `main.dataset.mode`; code outside the editor reads it there.
- **A fixed window.** On this page `html` and `body` never scroll. The layers tree, the panel bodies and the canvas each scroll or pan on their own.
- **Three regions, resizable and foldable.** A 48 px top bar (kitvas mark, title, version picker, compare; Preview and Edit; undo, redo, session line, Save version). Below it a left panel (Layers, Insert), the canvas, and a right panel (Properties, Changes, Checks, and Sketches on a craft draft). A grip on each panel's inner edge resizes it (drag, or arrow keys in 16 px steps, double click resets); `[`, `]` and `Ctrl/Cmd+\` fold panels to 40 px rails. The canvas keeps at least 320 px. Widths and folds are kept per viewer in `localStorage`, guarded. Below 1100 px the panels open as overlays. A panel's size never reloads the frame.
- **The canvas.**
  - Zoom runs from 10 % to 400 %, by buttons, a typed percent, and Ctrl/Cmd+wheel or pinch over the page and over the frame (the frame runtime forwards them over the channel). Fit is `Shift+1`, Selection `Shift+2`, 100 % `Ctrl/Cmd+0`.
  - Fit follows the room: the screen opens in Fit and re-fits when panels or the window change. Any other zoom stays until Fit is chosen again.
  - Space+drag and the middle button pan.
  - The width is set in place (presets 390, 768, 1280 so the checks' marks show; any width from 320 to 2560 with the marks hidden), and so is the state. The address follows with `history.replaceState`. The frame is never moved in the DOM or reloaded for these.
- **One table of shortcuts.** `?` opens a searchable list read from one table that the context menu also uses; every action has a visible control or menu entry.
- **Properties.** The panel is regrouped (Component, Text, Layout, Spacing, Size, Typography, Background, Border), with a box model for spacing and segmented buttons for keywords. `STYLE_PROPERTIES` gains per-side padding and margin, `display`, the flex keywords, `align-self`, `text-align`, `border-style`, the outline properties, `background-image` and `background-size`. Each property has a value kind (a token type, a keyword list or an image). A keyword from its fixed list is never off-kit; any other keyword is refused. A background image is only `url(../img/<file>)` of a file in the version. A kit component prop that covers a property still wins (ADR 0050).
- **Undo save.** For 8 seconds after Save version the bar offers "Undo save". `POST /api/v1/drafts/{slug}/edits/reopen` with `{version, startedAt}` writes the session back when that version is still the latest and no session is open, and answers 409 `EDIT_SESSION_TAKEN` otherwise. The page keeps the undo and redo stacks from before the save and restores them on success.

## Consequences

- The skin keeps to the Base tokens; the layout follows editor conventions and the look stays plain until a studio-wide design pass.
- The panels' markup moves into the screen (`src/studio/pages/`), and the client parts that were one aside mount into tabs. The older toggle is gone.
- Zoom now lives with the canvas and works without the editor. The stage 4b keys change (Ctrl/Cmd+0 is 100 %, Shift+1 is fit, Ctrl/Cmd+1 is gone).
- The reopen route is a write like `edits/end`; it changes only `draft.json`'s `edit` block. Undo save works only on the latest version, so a version someone else started cannot be taken back by accident.
- Not part of this decision, for later parts: two widths at once, forced hover and focus, accessibility card, live checks, Tailwind style edits, select and say, the timeline, locks and element note pins.
