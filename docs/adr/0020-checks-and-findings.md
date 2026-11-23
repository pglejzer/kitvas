# 0020. Checks and findings

Date: 2026-11-22. Status: accepted.

## Context

An agent and a person need to know what is wrong with a draft, where, and what to do about it, in one list. Section 8 of the spec names five checks. Three of them need only files; two need a browser.

## Decision

Every check reports findings with the same fields: rule id, severity (`fix` or `review`), place, element id, message, hint, states and widths. `kitvas check` builds the draft first, runs the checks that read files (`build`, `types`, `ds`), writes `build/json/checks.json` and exits with 0 whatever it finds.

`types` runs tsc from the `typescript` package on a generated tsconfig that maps `@kit` to the kit's entry and React to `@types/react`. Both packages became runtime dependencies.

`ds` reads sources. Imports come only from `@kit`, `react` and the draft; named imports from `@kit` must be catalog names; plain controls are reported where the kit has a component (review); hand-written colours and unknown `--kit-*` names are to fix; sizes in margins, paddings, gaps, radii and font sizes are compared with tokens of that kind (`fix` when equal to a token, `review` otherwise).

Rules of plan 4a:

| Rule | Severity | Found when |
| --- | --- | --- |
| `build/bundle`, `build/styles` | fix | esbuild or Sass reports an error |
| `types/<TS code>` | fix in `src/`, review elsewhere | tsc reports an error |
| `ds/foreign-import` | fix | an import from anything but `@kit`, `react` or a relative path |
| `ds/not-in-catalog` | fix | a named import from `@kit` that is not a catalog component |
| `ds/raw-control` | review | a plain `<button>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` while the kit has a component of that category |
| `ds/raw-color` | fix | a hex colour, a colour function or a colour name in a style value |
| `ds/unknown-token` | fix | `var(--kit-…)` with a name the kit does not have |
| `ds/raw-size` | fix when the value equals a token, else review | a px or rem length in a margin, padding, gap, radius or font size, while the kit has tokens of that kind |

## Consequences

Findings from tools keep the tool's own words. Rules work on text, not on a parser, so an unusual way of writing an import or a declaration can be missed; each rule has tests with exact places. `a11y` and `runtime` are reported as skipped until the browser checks are added (plan 4b).
