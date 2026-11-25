<!-- Read AGENTS.md first: it holds the rules every change follows. Fill in every heading; write "none" where nothing applies. -->

## What changes

<!-- One or two sentences: what a person using kitvas gets, or what was wrong and is fixed. -->

## Why

<!-- The problem it solves. Link the issue: "Closes #123". -->

## How it was checked

- [ ] `npm run check` passes: lint, types, tests with coverage, audit.
- [ ] `claude plugin validate . --strict` passes.
- [ ] A changed skill, agent or `reference/` file: the evals of that skill pass (see `evals/README.md`), with the table pasted below.
- [ ] A change in the studio: looked at in a browser, in light and dark.

## Rules from AGENTS.md

- [ ] No `any` in any form, in code, tests or generated code.
- [ ] Text for people comes from `locales/en.json` through `t()`.
- [ ] Third-party packages load only through `src/shared/deps/deps.ts`; a new one has an exact version and is at least 14 days old.
- [ ] Code files have at most 500 lines, test files at most 800.
- [ ] A changed decision has a new ADR in `docs/adr/`, and `npm run adr` was run.
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]`.

## Notes for the review

<!-- What to look at first, what was left out on purpose, and anything still open. -->
