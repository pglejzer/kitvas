# Fixture pages for the facts walk and the passes

Small pages that `test/checks/adapters/playwright-facts.test.ts` and `test/checks/adapters/playwright-facts-passes.test.ts` open from disk through `BrowserSession.visit`, the way a draft's `build/html/index.html` is opened. Each page renders into `#root`, and its elements carry `data-ks` marks as drafts do. Fonts are system fonts (Arial or its fallback), so a test compares the facts with what the same page measures, never with fixed pixel counts.

- `text.html`: a paragraph of about three lines at 320 px. A script writes a per-character count of it into `#truth` ("lines widest"), which the text facts are held to within one character.
- `labels.html`: fields named every way (a visible label with a `*` mark, a visually hidden label, `aria-label`, a placeholder only, nothing), radios in a fieldset with a legend, an invalid field described by an error text, a password; a visually hidden span (`sr-only`), a span clipped to nothing by `clip-path: inset(50%)`, a shown span; a link with an icon, an icon button named by `aria-label`, a submit button and an image with width and height.
- `sticky.html`: a sticky header the page starts under. Buttons fully and partly under it, one clear of it whose own sticky child covers it (a stop's own child never covers it), and a link inside the header. The page is tall, so the header is measured as a fixed bar one viewport down.
- `reflow.html`: at 320 px, `#inner` inside `#outer` is past the edge (the deepest is named); a wide table in an `overflow-x: auto` wrapper and a wide fixed bar are exempt. Nothing is past the edge at 390.
- `spacing.html`: `#tight`, a fixed-height button with its overflow hidden, is cut off once the WCAG 1.4.12 override makes its line taller; `#roomy` grows with it; `#cut` is cut off before the override already, so it is nothing new.
- `focus-cap.html`: 70 buttons, more than the walk presses Tab.
- `focus-cycle.html`: a focus trap of three buttons: the browser's own ring, `#plain` with no indicator at all, and `#ringed` with a shadow ring. Tab on the last goes back to the first.
- `good.html`: a link, a heading, a paragraph and a labelled field with a submit button, all fitting at 320 px with the browser's own focus rings: no reflow, spacing, hidden or uncovered problem.
- `throws.html`: hit testing (`document.elementsFromPoint`) throws once a button has focus, so the focus pass fails part way while the facts, axe and the other passes still work.
- `unsure.html`: white text over a gradient, which axe cannot decide (`contrastUnsure`), and plain text on white, which it can.
- `missing.html` must not exist: the test of a page that does not load opens it.
- `deep-*.html` belong to the deep passes and are described in `test/checks/adapters/playwright-deep.test.ts`.
