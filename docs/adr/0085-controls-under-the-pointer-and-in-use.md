# 0085. A check puts every control under a real pointer, gives it focus and uses it

Date: 2026-11-26. Status: accepted, changed in part by ADR 0096. Adds two passes to `0044-page-facts-and-extra-passes.md`; the order of the others stays.

## Context

A check read each page at rest. A draft passed with a toggle whose text turned white on white under the pointer (the kit's own hover rule replaced the background of the draft's "on" style, at 1.0:1), and with a date range, a grouping and a search field that changed nothing. No rule could see either: the facts held one look of each control, and nothing ever pressed one. The person found both in the first minute.

## Decision

- **`states`, at 390 and 1280 px.** `src/checks/adapters/facts/playwright-states.ts` takes every control the walk knows (at most `STATE_CONTROL_CAP`), turns transitions off, reads its texts at rest, moves the real pointer over it (`page.mouse.move`, tried again at the middle of the view when something covers it), reads again, then presses one key and focuses it so `:focus-visible` matches, and reads again. A text is its ink laid over its ground. A read is kept only for a text whose ink or ground differs from rest. The page is left with the pointer parked and nothing focused.
- **`a11y/state-contrast`, `fix`.** A text of a control under the pointer or with focus needs 4.5:1, large text 3:1: WCAG 1.4.3 covers text "shown when a pointer is hovering over an object or when an object has keyboard focus". The finding names the control, the state and the ratio. It stays `fix` inside a kit component too (`kit: 'keep'`): the draft's own style on a kit control is the usual cause.
- **`press`, at 1280 px only, last in a visit.** `playwright-press.ts` uses each control once (at most `PRESS_CONTROL_CAP`): a button is clicked; of a group of toggles, tabs, radios or switches with one parent, one that is off; a select outside a form gets another value; a search field gets text. A `MutationObserver` on the body says where the page changed: inside the control (or the group's parent) is `own`, anywhere else, a dialog, a new address or focus that left the control is `page`, nothing is `none`. Links, submit and reset buttons of a form and selects of a form are never used. It runs last because it changes the page for good, and not in the visits of an option's other values.
- **`ux/dead-control`, `review`.** A button with `none`, and a choice, a select or a search field with `none` or `own`, changed nothing a person can see. In an `empty`, `loading` or `error` state only buttons are asked to answer: what a filter governs is not on the page there. It is `review`: the pass cannot tell a control that should lead out of the screen from one that is broken.
- Craft visits run neither pass: a sketch board has no controls of its own.

## Turned down

- **Forcing `:hover` through the browser's debugging protocol.** It marks the element without moving a pointer, so `mouseenter` handlers do not run, a covered control still counts as reachable, and the code holds only for Chromium.
- **Rewriting the style sheets so `:hover` rules match a class.** The copy changes the order and the specificity that decide which rule wins, and the bug here was exactly one rule beating another.
- **Reading the styles and the handlers in the source.** The cascade of a kit's sheet and a draft's sheet is only known in the page, and a handler that sets a value nobody reads looks alive in the code.
- **Pressing at both widths and in every option value.** One use per state answers whether a control works, at a third of the time.

## Consequences

A check takes longer, about 0.2 s for each control at each width. The press pass can miss a control whose only effect is on a canvas, in storage or in a request, and reports it as `review`; a page that changes by itself while a control is used counts that control as working. The rules for makers are in `reference/controls.md`, the research behind them in `docs/research/control-states.md`.
