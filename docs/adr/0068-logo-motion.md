# 0068. The logo moves: an entrance once for a tab, and a sign while Claude works

Date: 2026-11-25. Status: accepted, changed in part by ADR 0084. Changes in part ADR 0057 (its motion rule: every motion takes the studio's motion times, and nothing moves while idle). Spec: `docs/specs/2026-11-25-kitvas-start-page-design.md`, section 6.2. Plan 18d, agent B.

## Context

The owner wants the logo on the start page "animated nicely", and the logo in the bar of every page. ADR 0057 gave the studio three motion times (`--st-motion-fast` 140 ms, `--st-motion-slow` 240 ms, `--st-motion-flash` 560 ms), an ease, and the rule that motion answers what the person did; a test fails on a time an area writes by hand. The logo's mark is a block with a pointer, and the pointer is the same shape as the "v" of the word: the motion can tell that, a "v" lifting off the word and docking as the pointer. That flight does not fit the token times, and a sign of Claude working has to repeat while the work lasts.

## Decision

- **The logo is an inline SVG with named parts.** `src/studio/pages/brand/logo.ts` draws it from the paths of `docs/brand/kitvas-logo.svg` in the text's colour; the block, the pointer and the six letters each carry a class. A letter's place stays in its path's `transform`, so a rule that moves the letter never takes the place away; the pointer's place is said by a rule too, where its motions end.
- **The entrance, about 1.3 s, once for a tab.** The block fades in while it grows from 0.82 (320 ms); the six letters rise 12 px and fade in, 45 ms apart from 160 ms (280 ms each); at 640 ms a copy of the "v" lifts off the word in the accent colour, turns 135 degrees, shrinks to 0.83 and docks as the pointer (680 ms, an ease in and out with no overshoot), turning back to the ink as it lands. It plays on a logo marked to play (the start page's), only while `<html>` has `data-logo-enter`. An inline script before that logo sets it before the first paint when the tab's session storage has no mark, and writes the mark: no entrance on a reload, a filter, or a return from the editor, and no logo painted still and then hidden. A storage that refuses means no entrance.
- **The working sign.** While the studio's listening session says `working`, the pointer of a bar's logo takes the accent colour and taps the block, 3.5 px in and back, every 1.2 s. Listening and off: still, in the ink. The bar's script sets `data-claude` on `<html>` from the same state as the bar's status, and takes it off when the stream is lost or a read fails, so the sign never stays on while the studio cannot be heard.
- **What holds of ADR 0057.** Opacity and transform move, with the pointer's colour during the flight as the one other change; nothing bounces, nothing scales from zero, nothing moves on hover. Under reduced motion the shared rule stops both motions: the logo stands whole, and the working pointer keeps the accent colour, which is no motion. These times are written once, in the shared rules (`src/studio/pages/skin/logo.ts`); the test on hand-written times in an area still holds for every area.

## Turned down

- **The token times.** At 240 ms the pointer's flight from the word to the block does not read as a flight: it is a jump. Stretching the tokens would slow every pane and menu of the studio.
- **A logo that never moves.** The owner asked for the motion, and a still logo cannot show that Claude works, where the bar's dot alone is easy to miss.

## Consequences

The studio has two motions with times of their own, both in one file of shared rules. Each studio page's script paints Claude's status in its bar and reads the state through `GET /api/v1/listening` and the `listening` event, so the logo's sign works on pages that show no draft.
