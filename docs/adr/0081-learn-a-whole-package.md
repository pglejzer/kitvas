# 0081. Learning a whole package: the schema as a file, the exports read from the package, fragments merged by kitvas

Date: 2026-11-26. Status: accepted. Adds to ADRs 0030 to 0034 (project kits, the learner); it changes none of their decisions. Plan 24.

## Context

On 2026-11-26 the owner learned `@mui/material` 9.6.0 (about 110 visual components) with `/kitvas:learn`. It went wrong in four ways. The rules told the learner an example is `code` and `imports` and that `state` is one object; the contract wants a `title` and an array, so `schema` failed. The core pass stopped at 49 components and the skill never asked whether the person wanted more. `gaps` named 8 of the 60 left out, because the agent lists what it remembers. And one learner did everything. Done by hand the same day, three learners in parallel, each with the exact shapes and its own file, then one merge and one `kit verify`, gave 109 components.

## Decision

- **The contract is a file the agents read.** `reference/kit.schema.json` is JSON Schema made from the zod schema (`npm run kit-schema`); a guard test fails when it is stale. The rules in `reference/learn.md` and `reference/write-kit.md` point at its `$defs` and explain them; where they differ, the file wins.
- **What a package offers is read from the package.** `kitvas kit exports <id>` lists the component names the kit's source exports, which of them the kit covers and which are open. `gaps` keeps `unsupported` and `unverified`, and `missing` only for a part of a component the learner wrote. The report of a learn says `covered` of `total` from this command.
- **A big system is learned by several learners at once, each writing its own fragment; kitvas merges.** A fragment is `<kit>/parts/<name>.json`, holding `components` and `gaps`. `kitvas kit merge <id>` checks all of them against the contract before it writes anything, replaces or adds components, joins `gaps`, writes `kit.json` once and removes `parts/`. It never runs `kit verify`; the skill does. Issues go back to the learner that wrote the fragment, at most two rounds.
- **The skill asks the scope once:** the core (about 30 components, a few minutes; rule L5) or everything the source exports. The default is the core, and naming components skips the question. The compose skill uses `kit exports` too: a component the kit lacks but the package offers is added on the person's yes.

## Turned down

- **Describing the shapes in prose rules only.** That is what drifted; a prose copy of the contract goes stale the day the contract changes.
- **A complete `gaps` list written by the agent.** It wrote 8 of 60. An agent cannot count what it did not read.
- **kitvas writing the open names into `gaps`.** A second copy of what the package says, stale when the package is updated; `kit exports` reads it fresh every time.
- **One learner for everything.** It is slow, and it guesses the props of the thin components when the context runs short.
- **Several learners editing one `kit.json`.** They overwrite each other; separate fragments and one merge cannot.
