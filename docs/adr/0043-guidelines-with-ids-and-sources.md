# 0043. Guidelines with ids and sources

Date: 2026-11-23. Status: accepted. Adds to `0020-checks-and-findings.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-3a-ux-ui-checks-design.md`, sections 4, 6 and 10.

## Context

ADR 0020 keeps the rules of a check in a table in the document. Stage 3a adds the `ui` and `ux` checks and many more `a11y` rules, and most of them rest on advice from public sources, not on a standard. A table in a document does not say where a number came from, cannot be listed by a command, and lets a threshold be copied into rule code and drift.

## Decision

- **The book is data.** `src/checks/domain/guidelines/` holds one entry per rule and per manual checklist item, one file per chapter. An entry has its `id`, `check`, `chapter`, `mode` (`auto`, `deep` or `manual`), `severity`, `basis`, `thresholds`, `sources` and optionally `screens`. Its text lives in `locales/en.json` as `guideline.<key>.rule` and `guideline.<key>.why`, in kitvas's own words.
- **Ids are `<check>/<name>`,** the form of ADR 0020, for example `ui/line-length`. A rule and its entry share one id.
- **Sources are fetched and listed.** `basis` is `source` (at least one name and https URL, each fetched in the research pass) or `heuristic`. A heuristic says so in the studio and in `kitvas guidelines`; it is never presented as a standard.
- **Thresholds live only in the book.** A rule reads them from its entry and writes no number of its own, pixel tolerances included.
- **Severity discipline.** `fix` only when the threshold is sourced (WCAG AA, or a clear consensus of the listed sources) or the output is plainly broken. Everything else is `review`.
- **Where sources disagree** (required versus optional marks, label position, body size), the rule checks consistency inside the draft and never picks a convention.
- **Kit components are trusted.** A finding caused by a kit component's own markup or style is `review` with the `kitInternal` hint. Rules about counts and rhythm measure the draft's elements and component roots, never the inside of a component.
- **Screen kind.** `layout.md` takes an optional `Screen: <kind>` line before the first section (`landing`, `form`, `sign-in`, `sign-up`, `checkout`, `dashboard`, `list`, `detail`, `article`, `settings`, `other`). Entries with `screens` apply only when the kind matches; with no line they do not run. State ids starting with `empty`, `loading` or `error` get the state rules, and `filled` is the baseline.
- **`kitvas guidelines [<id>]`** prints the book, filtered by check, mode or screen, with the rule and why text. An unknown id is the error `GUIDELINE_UNKNOWN`. Compose uses it to run the manual checklist from the screenshots.
- **The rule table of ADR 0020 now lives in the book.** ADR 0020 stays as written; a new rule is a book entry, not a table row.

## Consequences

Every finding can point to its rule sentence, its basis and its sources, and the studio can show them. A number is changed in one place. Adding a rule costs an entry, a pure rule, four message keys and a test, and a guard test keeps the book and the rules in step. The cost is more files and locale text per rule, and a fetched-source requirement that slows new rules down on purpose.
