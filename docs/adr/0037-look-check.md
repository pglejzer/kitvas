# 0037. The look check

Date: 2026-11-23. Status: accepted. Adds to `0031-agent-written-kits-verified.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-2b-written-kits-design.md`, section 7. Evidence: `docs/spikes/11-look-score.md`.

## Context

An agent can write a written kit whose components compile and render but look nothing like the source. Compiling and rendering prove nothing about the look. A single mean pixel difference misses size, because scaling hides a wider button, and plain SSIM ranks a 1 px text shift below another font.

## Decision

- **`kit verify` has a sixth step, `look`.** For each shown example with a `reference`, the catalog page is opened at 1280 px (390 px when the reference path has a `-390/` segment), the example's root element is captured to `look/<key>.png`, and both images are compared in pure code.
- **Three parts**: `size` (ratio of widths times ratio of heights), `colour` (mean channel difference after both are scaled to the reference size and blurred 2 px, on white) and `structure` (mean SSIM of 8 by 8 grey windows, stride 4, after a 1.5 px blur). The score is the lowest of the three, 0 to 100, one decimal.
- **The line is 90.** Under it is `kitIssue.lookFar` with the three parts, so the agent knows what is off. A component whose examples have no reference gets one `kitIssue.lookNoReference`.
- **Advice, not a gate.** A failed `look` makes `valid` false like `render` and `tokens`, but never blocks drafts. `verify.json` is written with `schemaVersion` 2 and a `look` list; version 1 files read as before.
- Fonts and radii are small differences on a small control, so they are left to the agent, who sees the reference beside `look/<key>.png`. The studio shows the reference beside each example with its score, or says the score is stale after a component changed.

## Consequences

The look is measured, not claimed. It catches wrong colours, fills and sizes reliably. It is noisy for anti-aliasing and fonts, which is why the line is advice and the person sees both images. Without a browser the step is skipped with a note, like the other browser steps.
