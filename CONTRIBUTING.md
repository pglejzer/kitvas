# Contributing to kitvas

kitvas is a Claude Code plugin: it builds UI prototypes from a design system and checks them in a local studio. This page says how to report a problem, how to set the repository up and what a pull request has to pass.

Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Report a problem or propose a change

Open an issue from one of the three forms at <https://github.com/pglejzer/kitvas/issues/new/choose>:

- **Bug**: something does not work as the README or the docs say. Run `kitvas doctor --report` first and paste what it prints: it leaves out names and addresses. See [When something does not work](docs/troubleshooting.md).
- **Feature**: a change or something new. [IDEAS.md](IDEAS.md) lists the ideas already on the table; if you need one of them, name it in the issue.
- **Kit**: a design system that kitvas cannot learn, verify or render as it looks in your product.

A vulnerability never goes into a public issue: follow [SECURITY.md](SECURITY.md).

For anything larger than a small fix, open an issue before you write the code, so the direction is agreed before the work is done.

## Set up

You need Node `^24.22.3` or `>=26.13.1`. TypeScript runs directly in Node, so there is no build step.

```bash
npm ci --ignore-scripts                   # install
node bin/kitvas.ts status --json          # run the CLI from the repository
npm run check                             # the full gate: lint, types, tests with coverage, audit
node --test test/shared/config.test.ts    # one test file
npm run format                            # fix formatting
```

To try the plugin in a project of your own, start Claude Code with `claude --plugin-dir <path to this repository>`.

## The rules

[AGENTS.md](AGENTS.md) holds the rules every change follows and says where each part of the code lives. A coding agent loads it by itself; a change written with one is held to the same rules, and you answer for it. Several folders have rules of their own in an `AGENTS.md` beside the code: `src/kit/`, `src/drafts/`, `src/render/`, `src/checks/`, `src/studio/`, `src/edit/`, `src/handoff/` and `kits/kitvas-ui/`.

The ones a pull request breaks most often:

- Never the `any` type, in any form: not in code, tests, generated code or samples.
- Text for people comes from `locales/en.json` through `t()`. English only.
- Third-party packages load only through `src/shared/deps/deps.ts`. A new dependency has an exact version, is at least 14 days old and leaves `npm audit` clean.
- Modules talk through their `index.ts`.
- A code file has at most 500 lines, a test file at most 800, and a folder holds at most 20 code files directly.
- Build only what the change needs, reuse what the repository has, and remove in the same pull request the code, texts, styles and tests the change makes unneeded.
- Every CLI command supports `--json`.
- kitvas is a new project. MIT-licensed code may be copied when its copyright and licence notice stay with the copied part. Code of other tools is never copied.

Guard tests in `test/guards/` enforce most of these, so `npm run check` tells you.

## A pull request

1. Branch from `main` and keep the pull request to one topic.
2. Add tests for what you change. A bug fix starts with a test that fails without the fix.
3. Run `npm run check` and `claude plugin validate . --strict`. The `check` workflow does not run on pull requests at the moment, so the run on your machine is the check: say in the pull request that both passed.
4. A changed skill, agent or `reference/` file: run the evals of that skill, as [evals/README.md](evals/README.md) says.
5. A change in the studio: look at it in a browser, in light and in dark. When the README's GIF or screenshots show what you changed, record them again with `scripts/readme/record.ts`; its first lines say how.
6. Add an entry to [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]`, in the words of a person using kitvas.
7. A changed decision needs a new record in `docs/adr/`, not an edit of the old one; then run `npm run adr`. A feature alone needs no record.
8. Fill in every heading of the pull request form.

Documentation for people is in `docs/` and in the README; update it in the same pull request when the behaviour it describes changes.

## Licence of your contribution

kitvas is under the [PolyForm Shield License 1.0.0](LICENSE.md) and its kitvas UI kit under the [MIT License](kits/kitvas-ui/LICENSE); [LICENSING.md](LICENSING.md) says which covers what. By opening a pull request you agree that your contribution is licensed under the terms of the part it changes, and you confirm that you have the right to contribute it.
