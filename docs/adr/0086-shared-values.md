# 0086. Sections share what a person chose through shared values, held by the bundle's entry

Date: 2026-11-26. Status: accepted.

## Context

A draft's entry gave a section only `state` and `options`. A control in one section could not change another: a date range above four numbers, a chart and a table had no way to reach them, so makers drew controls that did nothing, and the layout scaffold still said that a section may "own state that others use". The first rule written against it (a control sits in the section it changes) forced a dashboard into one section, which is the unit of a maker, of the editor's section tools and of the files.

## Decision

- **The file.** A version may hold `src/json/shared.json`: `{ "schemaVersion": 1, "values": [...] }`, at most 12 values. A value with `values` is a list of 2 to 24 choices with a `default` among them; one without is free text of at most 80 characters. The types, limits and the two pure functions `defaultShared` and `keepShared` are in `src/shared/values/shared-values.ts`, which the server and the frame both import (ADR 0080).
- **In the draft.** `kitvas layout` checks the file (`checkSharedValues`), writes `src/tsx/shared.ts` (`Shared`, a union of ids for a list and `string` for text, and `SetShared`) and an entry whose `Draft` takes `shared` and `setShared` beside `state` and hands them to every section as a spread, as it does with options. A version without the file is byte for byte what it was. The section context lists the values as `sharedValues`.
- **At run time.** The values live in the bundle's entry, not in the draft: `mountSource` draws the draft through a small component `Held` that keeps them in React state and takes its start from `holdShared` of the frame runtime. `holdShared` keeps the current values on `globalThis` under `SHARED_HOLD`, so a build that the studio swaps into the page starts from what the person had chosen, less what the new build no longer declares. A change with an undeclared key or value changes nothing.
- **The check.** `ux/shared-unused` (`fix`, static) reads the sections' code: a value that no section sets with `setShared({ <id>: … })` has no control, and one that no section reads as `shared.<id>` changes nothing.
- A state switch keeps the values; a new page load starts from the defaults. The editor does not edit `shared.json`.

## Turned down

- **One section for a control and everything it changes.** It makes a dashboard one file and one maker, and takes the page's parts away from the editor's section tools.
- **`useState` in the generated entry.** The entry belongs to the draft's source and is type-checked with it; state there is lost on every build swap, and the frame could not keep it.
- **A React context the sections read.** A section would import a module of the page and stop being a function of its props: the type check could not say which values it uses, and a section drawn alone would throw.
- **Reusing options.** An option is a choice of the designer between looks, fixed for a visit and checked value by value; a shared value is what the person changes while using the page.

## Consequences

Makers have one more thing to get right, so the brief has a line for every control and the layout names who sets and who reads each value (`reference/controls.md`). The check knows only the two written forms, so a section that destructures `shared` is reported as not reading it. The hand-off to code and to Figma takes the page at its defaults.
