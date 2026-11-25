# 0073. Wide screens in the deep checks

Date: 2026-11-25. Status: accepted, changed in part by ADR 0074. Changes in part ADR 0044 (the deep widths).

## Context

ADR 0044 made `kitvas check` visit each state at 390 and 1280 px, and `--deep` add measured visits at 768, 1024 and 1440 px for four layout rules. Nothing was checked wider than 1440, and 1920 px is the most common desktop screen. On a wide screen an image can be shown past its file and a field can run across the page, and no rule looked for either.

## Decision

- **`--deep` also visits 1920×1080 and 2560×1440.** They are measured like the other deep widths: no passes, no screenshot. The deep widths are now 768, 1024, 1440, 1920 and 2560 (`DEEP_VIEWPORTS`).
- **Two rules**, run at the main widths and at every deep width (`DEEP_WIDTH_RULE_IDS`):
  - `ui/upscaled-image` (review): a raster `<img>` shown more than 1.25 times its natural width or height. An image whose current source is SVG is left out (`ImageFacts.vector`).
  - `ui/stretched-field` (review): a text field, text area or select wider than 640 px on a page 1280 px or wider.
- `ui/line-length` already catches a paragraph with no `max-width` once these widths are visited.
- The README and `docs/checks.md` say what is checked: 390 and 1280 in every state, reflow at 320, and `--deep` measuring 768, 1024, 1440, 1920 and 2560.

## Turned down

- **1920 in every check.** Each width is one more browser visit per state, for every run.
- **Screenshots at the deep widths.** They would cost time and disk, and the measured rules do not need them.
- **A fixed "max container width" rule.** Kits differ in their container width. Line length and field width say the same thing without assuming a number for the whole page.

## Consequences

`--deep` makes two more visits per state. The default check is unchanged. Facts gain `ImageFacts.vector`, so any code that builds image facts by hand must set it.
