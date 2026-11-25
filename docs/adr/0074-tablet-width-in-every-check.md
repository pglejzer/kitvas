# 0074. The tablet width in every check

Date: 2026-11-25. Status: accepted. Changes in part ADR 0073 (the deep widths) and ADR 0044 (the default widths).

## Context

A pricing draft was opened at 698 and 746 px. The Base kit's `Grid` kept three columns, so each card was about 150 px wide, every button label broke onto two lines ("Try Pro free / for 14 days") and the card text ran 15 to 20 characters per line. `kitvas check` (390 and 1280) and `check --deep` (which adds 768, 1024, 1440, 1920 and 2560) reported nothing, because no rule looked for a squeezed label or a narrow column, and a plain check never visited a width between the phone and the laptop.

## Decision

- **768×1024 is a width visit of every screen check**, not only of `--deep`. It is measured like the deep widths: no passes, no screenshot, only the rules in `DEEP_WIDTH_RULE_IDS` run. `TABLET_VIEWPORT` is its size; `DEEP_VIEWPORTS` now holds 1024, 1440, 1920 and 2560. A craft board is still visited at 390 and 1280 only.
- **Two rules**, both `review`, both in `DEEP_WIDTH_RULE_IDS`, so they run at every width visit:
  - `ui/wrapped-action`: the visible label of a button, `role="button"`, input button, or a filled or bordered inline-block link renders on two or more lines (`ActionFacts.lines`, counted like the text facts count lines). A link in running text, and a block link such as a card, are never counted.
  - `ui/narrow-column`: a text block of at least 3 lines whose longest line holds fewer than 25 characters. Headings, text inside a `<table>` and action labels are left out.
- **The Base kit's `Grid` steps down:** a Grid of three or more columns shows 2 columns under 960 px and 1 column under 640 px. The `columns` prop keeps meaning the count on a wide screen.
- The README, `docs/checks.md`, `src/checks/AGENTS.md` and compose rule R-COMPOSE-14 name 390, 768 and 1280.

## Turned down

- **A sweep every N px from 600 to 1000.** Each width is one more browser visit per state, in every run, to find what one tablet width and a better Grid already catch.
- **Keeping 768 in `--deep` only.** The owner met the problem in plain use, and `--deep` is run once before a final version.
- **An `auto-fit` / `minmax` Grid.** The number of columns would come from the content width, and the `columns` prop would stop meaning a count.

## Consequences

A plain check makes one more visit per state (about 15% more time on a draft with a few states). Facts gain `ActionFacts.lines`, so code that builds action facts by hand must set it. A draft that was clean may now report `ui/wrapped-action` or `ui/narrow-column` at 768.
