# 0044. Page facts and extra passes

Date: 2026-11-23. Status: accepted. Adds to `0020-checks-and-findings.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-3a-ux-ui-checks-design.md`, sections 3, 7 and 11a.

## Context

Axe and the usage records say little about how a page looks: line length, clipped text, spacing, focus, reflow. These need measurements from the live page. They must not make the check slow, and the rules that read them must be reusable where no Node exists: stage 4 runs checks inside the editor's frame.

## Decision

- **PageFacts are measured in the page.** One in-page function runs after the page settles and returns plain data: viewport and document sizes, one capped record per visible element (ids, box, computed-style subset, text facts, form and link facts), and fixed or sticky boxes. The cap and every limit are named constants in one file. Code passed to `page.evaluate` uses nothing from its module.
- **Rules are pure and free of Node.** A rule is a function from facts to findings, with no Node module and no adapter, so stage 4 can bundle the rules into the frame.
- **Pass order in a visit:** load and usage, facts, axe, screenshot, `reflow`, `focus`, `deep`, `spacing`. `deep` comes before `spacing` because the spacing override changes the layout of every text, and `deep` restores the DOM, media emulation and viewport after each part.
- **320 by resizing the 390 page.** After the screenshot the page is resized to 320 by 568, measured for overflow, and resized back. A separate visit costs about 230 ms per state; a resize costs about 5 ms.
- **The focus walk uses real keys.** At most 60 Tab presses with transitions off; each stop records the changed styles, the indicator colours, what lies over it and its order.
- **The spacing override is a diff.** The WCAG 1.4.12 values are injected, clipping and overlap are measured again, and only problems new against the baseline count.
- **`--deep` adds passes.** It adds the long-text and long-number passes, orientation, reduced motion and pixel sampling at 390 and 1280, and visits 768, 1024 and 1440 wide for four layout rules. `checks.json` records `deep: true`.
- **Cost, from spike 11a.1.** A visit cost about 620 ms (load 230, axe 300, screenshot 90). Facts add 10 to 25 ms, the focus walk 20 to 180 ms, the spacing override about 10 ms. In all, +15 to 35%, inside the 2x budget, so everything but `--deep` stays in the default check.
- A pass that throws leaves its field empty and the visit goes on.

## Consequences

The default check stays fast and finds problems no source rule can see. Facts and rules are testable on plain data without a browser. The in-page code is split from the rules, so the browser adapter, not the rules, carries the risk of page quirks. `--deep` is slower and is run on request or before a version is handed over as final.
