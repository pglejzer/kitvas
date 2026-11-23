# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- License: PolyForm Shield 1.0.0 (LICENSE.md). kitvas may be used for any purpose except selling it or building a competing product.
- `kitvas status` and `kitvas init`, each with `--json`.
- Kit contract (`kit.json`), DTCG 2025.10 tokens turned into `--kit-*` custom properties, and `kitvas kit list | show | check | component | css`.
- The built-in kit "Base": tokens, 12 components and 8 icons; the `/kitvas:kit` skill.
- Dependency install into the plugin data folder, from a session hook and from the CLI.
- Drafts with versions in `.kitvas/drafts/`, `layout.md` checked against the kit, generated entry files, and `kitvas draft new | list | show | version`, `kitvas layout`, `kitvas context`.
- `kitvas build`: a draft as a page with the kit's styles, and a stable id on every element written in the draft (`build/json/ids.json`).
- `kitvas check`: build, types and kit rules of a draft as one list of findings with place, element id, message and hint (`build/json/checks.json`).
- Browser checks in `kitvas check`: axe at 390 and 1280 px in every state, blank states, errors and failed files, kit components held to the catalog as they render, and a screenshot per state and width. `kitvas browser` and `kitvas browser install`.
- The studio server: pages and a JSON API on 127.0.0.1 with Host, Origin, Fetch Metadata and token checks, problem details, ETags and a generated OpenAPI document, and a second origin that shows prototypes in a sandbox.
- `kitvas studio [draft]`, `kitvas studio status` and `kitvas studio stop`: the project's studio as a detached process that later commands find again, restarted when the plugin version changes.
- Studio events and jobs: a Server-Sent Events stream with replay after a reconnect, and builds as jobs with time, memory and output limits that can be cancelled.
- Check jobs in the studio, all sharing one browser that the studio starts at the first check and ends when it stops.
- `kitvas inbox`: notes left in the studio reach Claude through a held request.
- Studio pages open only from the one-time link that `kitvas studio` prints.
- Studio pages in the Base kit's look: a gallery of drafts with live thumbnails and a "Needs attention" filter, and a draft view with width, state and version switches, numbered findings and a next step.
- A live draft view: a state switch moves the prototype's elements to their new places without a reload, the findings are marked on the prototype, the page updates when a build or check ends, and two versions can be compared side by side with what changed, was added or was removed.
- A kit page in the studio: the kit's tokens with swatches, its components with props and examples, and its problems.
- Rendered examples on the kit page: each component example in a sandboxed frame, built by the new `kitvas kit build [id]` (as a job when the page opens) and served from the prototype origin (ADR 0029).
- Project kits: `kitvas kit new <id> --from npm:<package>|repo:<folder>`, `kit verify` and `kit use`; kits in `.kitvas/kits/` beside the built-in ones (ADR 0030).
- `kitvas kit verify`: schema, imports, types, render and tokens checked against the project's own packages and the browser, with the result in `verify.json` (ADR 0031).
- Packages and React come from the project, so a prototype uses the React of the person's app (ADR 0032).
- Component styles in the bundle: CSS, CSS Modules and Sass imported by components, placed before the draft's sheets (ADR 0033).
- Tailwind v4 kits, compiled with the project's own Tailwind in a child process, and the `ds/tailwind-arbitrary` and `ds/tailwind-unknown` rules (ADR 0034).
- `/kitvas:learn`: a skill and the `learner` agent that write a kit from a package or a folder of the project's components.
- The kit page shows where a kit comes from and whether its last verification still holds.
- An end-to-end test of the stage-1 path through the real CLI and studio, and evals for the three skills.
- `kitvas map [slug]`: the workspace for agents in one answer, drafts or one draft's sections, files and element ids.
- The `/kitvas:compose` skill with the `maker` and `patcher` agents: a draft from a brief, section by section, fixed until its checks pass.
- Quality gate: lint, types, tests with coverage, audit, and architecture, size, legacy and docs guards.

### Security

- Taking notes from the inbox is `POST /api/v1/inbox/take` with the studio's Origin; no GET changes state any more (ADR 0028).
- Refused requests of the studio and the prototype origin are written to the studio log, without queries, tokens or cookies, at most 20 a minute.
- Stopping a job ends the processes its command started, on Windows, Linux and macOS.
- A job that cannot start no longer puts the error's own text into the API; the cause goes to the log.
