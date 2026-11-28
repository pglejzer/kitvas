# Fixing findings

Read by the `patcher` agent. A finding has `rule` (`<check>/<name>`), `severity` (`fix` or `review`), `file`, `line`, `column`, `element`, `message` and `hint`. The rule prefix says which check found it. Rule ids here are `R-FIND-n`.

## Contents

- General rules
- build and types
- ds
- a11y
- ui
- ux
- Guideline details
- runtime
- options
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
- R-FIND-40: `ds/style-import`: delete the import line. The entry `index.scss` already includes the section's SCSS file (R-COMPOSE-43).
- R-FIND-12: `ds/raw-control`: replace the plain element with the kit's component of that kind (the message names them). Keep its text and handlers.
- R-FIND-13: `ds/unknown-prop`, `ds/bad-value`, `ds/missing-prop`: change the prop to one the catalog lists, with a listed value, and add required props.
- R-FIND-14: `ds/raw-color`: replace the colour with a `var(--kit-…)` colour token of the same role.
- R-FIND-15: `ds/unknown-token`: replace the name with a token that exists in the context's token list.
- R-FIND-16: `ds/raw-size`: when the message says the value is a token's value, write `var(--kit-…)`. When it says the value is off the scale, use the nearest step the hint names, unless the size must be exact; then report it as left on purpose.

## a11y

- R-FIND-17: `a11y/<axe rule>` findings come from axe-core at 390 px and 1280 px, in the states named. Fix the element in every state it appears. A finding on an element that is a kit component's own markup follows R-FIND-21.
- R-FIND-18: Missing names: add visible text or `aria-label`. Missing `alt`: add it.
- R-FIND-19: Contrast: change to a token pair with enough contrast; never lighten or darken by hand.
- R-FIND-20: Heading order and landmarks: change the kit component's level or tag prop; do not reach for plain elements.
- R-FIND-21: Targets below 24 px: raise the size of the component or its padding with tokens. A finding inside a kit component (severity `review`, hint `kitInternal` naming the component) is not fixed by restyling the component. Use another variant or prop of it. If none helps, leave it and report it as a note for the kit's owners.

- R-FIND-27: `a11y/reflow`: at 320 px wide the page scrolls sideways. Let the named element shrink or wrap: `flex-wrap`, `min-width: 0`, a `max-width` from a token, a stacked `Grid` at narrow widths. Never hide the overflow.
- R-FIND-28: `a11y/text-spacing`: text is clipped or overlaps when line, letter and word spacing grow. Remove fixed heights and `overflow: hidden` from the box, use `min-height` and padding tokens, and let it grow.
- R-FIND-29: `a11y/focus-visible` and `a11y/focus-hidden`: a control shows no focus or a fixed bar covers it. Use the kit's own focus style or a `--kit-…` focus token; never `outline: none` without a replacement. For a covered control, add scroll padding or move the fixed element out of the way.
- R-FIND-30: `a11y/control-contrast`, `a11y/icon-contrast`, `a11y/focus-contrast`, `a11y/contrast-unsure` and `a11y/contrast-on-image`: pick a token pair with enough contrast, or put a solid token surface behind text on an image. Never tune colours by hand.
- R-FIND-43: `a11y/state-contrast` (fix when the draft styles the control, else review as the kit's own look): the text of the named control is too close to its background under the pointer or with keyboard focus (the message says which, and the ratio). The usual cause: the control's "on" style sets a background, and the kit's own hover or focus rule replaces only that background. Show "on" with the kit's variant or prop first (R-CONTROL-2 of `reference/controls.md`). Where a style is needed, write the text colour and the background together for `&:hover`, `&:focus-visible` and `&:active` in the same rule, from tokens that pair. Never `!important`, never one of the two alone.
- R-FIND-31: `a11y/error-text`: an error shows only as colour or an icon. Add text that says what is wrong, tied to its field with the kit's field props (error and description props, not by hand).
- R-FIND-32: `a11y/autocomplete`: set the field's autocomplete value through the kit component's prop, using the standard token for what the field asks (email, given-name, current-password and so on).

## ui

- R-FIND-33: `ui/<name>` findings are about look: type, space, hierarchy, cards, chrome and media. Fix them with tokens (spacing, font size, radius, surface), kit props and structure: widths, a `max-width`, one `Stack` gap. Most are `review`; fix them when the change is plainly better. Never hide, remove content or disable a rule.
- R-FIND-34: `ui/line-length`: add a `max-width` token on the text block, or put it in a narrower column. `ui/page-overflow` and `ui/clipped-text`: let the box grow or wrap rather than clipping. `ui/image-size`: give the `img` width and height or an aspect ratio.
- R-FIND-35: A finding that counts things (sizes, cards, bands, buttons) is measured on the draft's own elements. Remove variety by using one token, one variant or one size across the group.

## ux

- R-FIND-36: `ux/<name>` findings are about forms, states and actions. Fix them with the kit's field, feedback and button components and their props: a visible label, one primary variant per section, a state's text and one action, a real label for a link or button.
- R-FIND-44: `ux/dead-control` (review): using the named control changed nothing on the page beyond the control itself (in an `empty`, `loading` or `error` state only buttons are checked). Make it change what the brief says it changes: render the section from the value the control holds, or, when another section shows the result, set a shared value and read it there (R-CONTROL-11, 12 and 27). A control that leads out of the screen answers with a `role="status"` line (R-CONTROL-13). When the brief gives the control nothing to change, take it out and say so in the report (R-CONTROL-25). Never add a change for show (a class, a counter nobody reads).
- R-FIND-45: `ux/shared-unused` (fix): a value of `v<N>/src/json/shared.json` that no section sets has no control, and one that no section reads changes nothing. Add the missing half in the section the layout names: `setShared({ <id>: … })` at the control, `shared.<id>` where the result shows. Never edit `shared.json`, `shared.ts` or `index.tsx`; a value the screen does not need goes into the report.
- R-FIND-37: `ux/placeholder-text`: replace the text with real content from the brief. Never reword it to dodge the match.

## Guideline details

- R-FIND-38: `kitvas guidelines <rule id> --json` gives a rule's sentence, thresholds and sources. Read it when the message is not enough.
- R-FIND-39: A `review` finding with the `kitInternal` hint is a kit component's own markup. Do not fix it by restyling the component; use another variant or prop, or report it for the kit's owners.

## runtime

- R-FIND-22: `runtime/blank`: the state shows nothing. Add content for that state in the section (see R-COMPOSE-15).
- R-FIND-23: `runtime/page-error` and `runtime/console-error`: read the message, find the code that throws in the files of the draft, and fix the cause.
- R-FIND-24: `runtime/request-failed`: a file or address could not load. Use a file in the version's `v<n>/src/img` folder and refer to it as `../img/<file>`.
- R-FIND-25: `runtime/console-warning` is a `review` finding. Fix it when the cause is plain, such as a missing `key` on list items.

## options

- R-FIND-41: `options/no-effect` (review): both main-width shots of a value equal the default's. Make the value's block or branch show a real difference with tokens, or report that the value is not needed; never delete the option.
- R-FIND-42: `options/unknown` (fix): the SCSS holds a `data-opt-<id>` that `options.json` does not declare. Correct the id or value to a declared one, or remove the block. Never add it to `options.json`.

## Not fixed

- R-FIND-26: Report a finding as not fixed when the fix needs something the kit lacks, a change to the layout, or a file outside the draft. Say why, in one line.
