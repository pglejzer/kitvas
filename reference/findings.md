# Fixing findings

Read by the `patcher` agent. A finding has `rule` (`<check>/<name>`), `severity` (`fix` or `review`), `file`, `line`, `column`, `element`, `message` and `hint`. The rule prefix says which check found it. Rule ids here are `R-FIND-n`.

## Contents

- General rules
- build and types
- ds
- a11y
- runtime
- Not fixed

## General rules

- R-FIND-1: Fix `fix` findings first. Fix a `review` finding only when the prompt asks for it or the fix is plainly better.
- R-FIND-2: `file` is relative to the draft's latest version folder. `line` and `column` are 1-based.
- R-FIND-3: A finding with `element` and no file: look the id up in the map given in the prompt (`elements` rows: file, line, column, tag). No map or no row means the finding is not located; report it.
- R-FIND-4: Make the smallest change that removes the cause. Do not restyle or restructure the section.
- R-FIND-5: Never edit the generated entry files `index.tsx` and `index.scss`. A finding in them is fixed in the layout; report it.
- R-FIND-6: Never hide a finding: no comments that disable a check, no removed content, no `display: none` to dodge a rule.

## build and types

- R-FIND-7: `build/…` findings are esbuild or Sass errors at `file:line`. Fix the syntax, the missing import or the misspelled name at that place.
- R-FIND-8: `types/TS…` findings are TypeScript errors. Read the message, then the component's props in the context or the catalog. Use only the props and values the kit lists.
- R-FIND-9: One mistake often causes several errors. Fix the first, then look at the rest before editing again.

## ds

- R-FIND-10: `ds/foreign-import`: remove the import and build the part from kit components.
- R-FIND-11: `ds/not-in-catalog`: replace the name with a listed component. If none fits, report it; do not add the name anywhere.
- R-FIND-12: `ds/raw-control`: replace the plain element with the kit's component of that kind (the message names them). Keep its text and handlers.
- R-FIND-13: `ds/unknown-prop`, `ds/bad-value`, `ds/missing-prop`: change the prop to one the catalog lists, with a listed value, and add required props.
- R-FIND-14: `ds/raw-color`: replace the colour with a `var(--kit-…)` colour token of the same role.
- R-FIND-15: `ds/unknown-token`: replace the name with a token that exists in the context's token list.
- R-FIND-16: `ds/raw-size`: when the message says the value is a token's value, write `var(--kit-…)`. When it says the value is off the scale, use the nearest step the hint names, unless the size must be exact; then report it as left on purpose.

## a11y

- R-FIND-17: `a11y/<axe rule>` findings come from axe-core at 390 px and 1280 px, in the states named. Fix the element in every state it appears.
- R-FIND-18: Missing names: add visible text or `aria-label`. Missing `alt`: add it.
- R-FIND-19: Contrast: change to a token pair with enough contrast; never lighten or darken by hand.
- R-FIND-20: Heading order and landmarks: change the kit component's level or tag prop; do not reach for plain elements.
- R-FIND-21: Targets below 24 px: raise the size of the component or its padding with tokens.

## runtime

- R-FIND-22: `runtime/blank`: the state shows nothing. Add content for that state in the section (see R-COMPOSE-15).
- R-FIND-23: `runtime/page-error` and `runtime/console-error`: read the message, find the code that throws in the files of the draft, and fix the cause.
- R-FIND-24: `runtime/request-failed`: a file or address could not load. Use a file in the version's `v<n>/src/img` folder and refer to it as `../img/<file>`.
- R-FIND-25: `runtime/console-warning` is a `review` finding. Fix it when the cause is plain, such as a missing `key` on list items.

## Not fixed

- R-FIND-26: Report a finding as not fixed when the fix needs something the kit lacks, a change to the layout, or a file outside the draft. Say why, in one line.
