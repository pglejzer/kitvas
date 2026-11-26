# 0084. The logo is a dovetail of two kit parts, with two loose parts that move

Date: 2026-11-26. Status: accepted. Changes in part ADR 0068 (the logo's mark, its colours and its motion). Spec: `docs/specs/2026-11-25-kitvas-start-page-design.md`, section 6.2.

## Context

The owner replaced the block-and-pointer logo after three rounds of `/kitvas:craft` sketches; the sketches with a letter as the icon were called generic. He picked a dovetail: a square of two kit parts joined by a hand-cut dovetail, beside the word `kitvas` with two loose parts, one as the dot of the "i" and one as a full stop. The icon and the parts are copper, the word is ink. He asked that a loose part move while Claude works.

## Decision

- **The parts and their classes.** `src/studio/pages/brand/logo.ts` draws the icon (`k-logo-icon`, a group of two paths: the left part with the tail and the right part with the socket, `k-logo-joint`), six letters (`k-logo-letter`) and two loose parts (`k-logo-dot`, the dot of the "i" with `k-logo-dot-i` and the full stop with `k-logo-stop`). The loose part's shape and turn are in `brand/part.ts`, a file that imports nothing, so the frame's mark of Claude draws it without the rest of the logo (ADR 0080). A CSS `transform` replaces the `transform` attribute, so what a rule moves never carries its place: the icon and the loose parts have their place on a group around them, a letter on its inner path. The turn of -15 degrees is a rule on `.k-logo-dot path`, around the part's own centre, so a motion can turn it.
- **The colours.** The logo is no longer one colour: the icon and the loose parts take the accent (`var(--st-color-accent)`), the word the text's colour. The markup has no colour; the rules are in `skin/logo.ts`. The brand files are copper and ink.
- **The entrance, about 1.1 s, once for a tab.** The icon fades in while it grows from 0.82 (320 ms); the six letters rise 8 px and fade in, 45 ms apart from 160 ms (280 ms each); then the two loose parts drop into place, each from 10 px higher, turned -75 degrees and transparent, landing at -15 degrees (420 ms, no overshoot), the dot of the "i" at 560 ms and the full stop at 700 ms. The trigger is the one of ADR 0068: a logo marked to play, while `<html>` has `data-logo-enter`.
- **The working sign.** While the studio's listening session says `working`, the right part of the icon nudges 1.5 units out along the joint and back every `LOGO_SWAY_MS` (1200 ms), as if the two parts were being fitted, in every bar logo (the editor's bar shows the mark alone). The full stop of the full logo also sways from -15 to +10 degrees and back around its own centre, and the frame's mark of Claude sways the same part with the same period. Nothing else moves.
- **What holds of ADRs 0057 and 0068.** The entrance plays once per tab; the triggers are those of ADR 0068; opacity and transform move, nothing bounces, nothing scales from zero, nothing moves on hover; the shared reduced-motion rule stops both motions; the times are written once, in `src/studio/pages/skin/logo.ts`.

## Turned down

- **Keeping the block and the pointer.** The owner chose the new mark.
- **A logo all in the text's colour.** The owner chose the copper icon and parts.
- **A still logo.** A still logo cannot show that Claude works, where the bar's dot alone is easy to miss.

## Consequences

Under reduced motion the logo shows no working sign of its own; the bar's status line still says that Claude works. The studio's logo follows the accent the person chose, while the brand files stay copper.
