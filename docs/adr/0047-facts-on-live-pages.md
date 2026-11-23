# 0047. Facts on live pages

Date: 2026-11-23. Status: accepted. Adds to `0044-page-facts-and-extra-passes.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-3b-rework-craft-design.md`, sections 5.2 and 5.4.

## Context

The 3a facts walk measures a draft's `#root`, and the visit rules judge those facts. A rework needs the same rules run on the original, a live page, and then needs the two results compared. A live page holds things a draft never does: menus pushed off the page, content clipped by a parent, and far more findings of one rule than a report should list.

## Decision

- **The walk takes a root.** `measureFacts(page, { root: 'draft' | 'page' })`. `draft` (the default) walks `#root`; `page` walks `body`. A survey of a live page uses `page`.
- **Hidden means not seen.** In both modes a node is `hidden` when its box lies entirely outside the document (right or bottom at or below 0, left at or beyond the scroll width), or entirely outside the clip box of an ancestor with `overflow` of `hidden` or `clip`. Rules skip hidden nodes, so an off-screen menu or a clipped carousel slide is not judged.
- **Only visit rules, only on the original.** A survey runs `VISIT_RULES` at 390 and 1280 px. Deep passes, state rules and source rules do not run: the original has no states and no sources. A page with no viewport meta gets `ui/no-viewport` (fix), reported at capture only and never on a draft.
- **Problems are kept whole.** `before/problems.json` holds the counts per rule and every finding at both widths before any cap. `MAX_FINDINGS_PER_RULE` limits what a report lists, not what is measured. `ux/before-problems` compares uncapped counts, so a cap can neither hide a problem that remains nor invent one that is gone.
- **The score is a count.** `reworkScore(before, after)` gives `{ fixed, left }` in rules: a rule whose count fell is fixed, one that stayed or rose is left. It is written to `checks.json` as the `rework` block.
- **A URL is fetched only through the scan policy.** Private ranges are refused, on every request and redirect, unless the person passed `--allow-private`.

## Consequences

The same rules judge a draft and its original, so "better" is measured and not claimed. Noise on live pages is bounded by the hidden rule, not by dropping findings. The cost is that a rule must be stable on a page it was not written for, which the three-page spike of the spec checks, and that two code paths (draft and page) walk the same geometry.
