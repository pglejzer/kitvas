# 0088. A hand-off to code keeps a version's shared values as the page's state

Date: 2026-11-27. Status: accepted. Changes in part `0086-shared-values.md`.

## Context

ADR 0086 gave sections shared values: one section's control sets a value, such as a date range, and other sections read it. Its consequences said that a hand-off takes the page at its defaults. For Figma that is right, since layers are a picture of the page. For code it is not. The brief told the fitter nothing about the values, so a dashboard reached the person's project with a range control that changed nothing and charts that never heard of it. That is the dead control that `ux/dead-control` and `ux/shared-unused` refuse in a draft.

## Decision

- **The brief lists them.** `kitvas handoff brief` adds `shared` when the version has `src/json/shared.json`. Each value has its id, label, default and choices (`null` for free text), and two lists of the draft's TSX files: `setIn`, the files that call `setShared({ <id>: … })`, and `readIn`, the files that read `shared.<id>`. A version without the file has no such field, and the brief is the same as before.
- **One reader.** `sharedUses` in `src/checks/domain/shared-values/shared-values-rules.ts` finds where each value is set and read. `ux/shared-unused` now takes its findings from it, so the check and the brief cannot disagree. It also sees a value taken out with `const { <id> } = shared`: the demo dashboard's chart reads its grouping that way, and the brief would have said that nothing but the control reads it.
- **The fitter keeps them the project's way.** R-FIT-23 in `reference/handoff-code.md`: each value lives where the project keeps a page's state (the page component's state, a hook, a store, or the URL query) and starts at its default. The files in `readIn` get the value, and the files in `setIn` get a way to change it. The `shared` and `setShared` props and `shared.json` are not ported as they are.
- The Figma hand-off is unchanged: it draws the page at the defaults.

## Turned down

- **Hand off at the defaults only.** The controls would come out wired to nothing, and the person would have to find and connect them by hand.
- **Copy `shared.json` and the bundle's `Held` component into the project.** That is kitvas's runtime inside the person's code, not the project's own technology (ADR 0079).

## Consequences

The fitter has one more mapping to make. Where the project has no place for page state that fits, the value goes under `open` in its report. A section that hands `shared` on whole to a part, or renames it, is still listed as not reading what it reads; R-CONTROL-27 keeps asking makers for the plain forms.
