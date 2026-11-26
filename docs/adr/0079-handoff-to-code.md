# 0079. A draft goes into the person's code: facts from kitvas, the files from the fitter agent

Date: 2026-11-25. Status: accepted. Changes ADR 0046 in part ("kitvas never writes into the application's own source"). Spec: `docs/specs/2026-11-25-kitvas-stage-5-handoff-design.md`, Part B, calls 4 to 6, the owner's decisions D2, D4 and D5. Plan 22.

## Context

kitvas drafts are React. The owner wants a finished screen, reworked page or crafted component, icon or logo to go into the person's own project, in that project's own technology, where and how the person says (D2, D4), and kitvas never installs a package there (D5). ADR 0046 kept every craft result in kitvas's own additions layer and said kitvas never writes into the application.

## Decision

- **kitvas reports facts and names no framework.** `kitvas handoff target` answers what the project holds: the root's names, each `package.json` (dependencies and scripts), a count of extensions, the fullest folders with samples, style files that declare tokens, the rule files. It keeps no table of frameworks. `node_modules`, dot folders and plain `.gitignore` folders are not read; `.env*` files, lockfiles and `.git/` are never read or written.
- **The fitter agent writes, kitvas reads, briefs, compares and records.** `kitvas handoff brief` writes what the agent needs (the draft's files and shots, each component's origin and the project module behind it, each token's value and the project's own variable, the write set, the `## Handoff` decisions) and a listing of the project. `kitvas:fitter` (Read, Write, Edit, Glob, Grep; no shell, no web) says the stack in one line, writes like the three nearest files of the project, maps to the project's own components and tokens first and plain markup otherwise, proposes wiring and packages in its report, and writes `fit.json`.
- **The write set is the person's word.** `new` (new files in the folder), `named` (also the files the person names), `open` (wherever the result needs). This changes ADR 0046 in part: kitvas now writes into the application, but only through the fitter, inside the scope the person gave; craft's `add` still goes to the additions layer.
- **What changed is compared by listing, not by git.** Before and after the fitter, each file's size and hash; `kitvas handoff changes` says what is new or changed inside and outside the scope and what was removed. Over 20,000 files nothing is watched, and the skill says so.
- **The check reports and never blocks.** The skill runs the scripts the person picked once (type check, lint, build), and `kitvas handoff compare` shoots the page at the address the person gives (loopback allowed; another private address only with `--allow-private`) against the draft's check shots with the `look` score. Nothing is undone on a low score; the fitter gets the result back at most twice.

## Turned down

- **A detector with a list of frameworks.** The owner's rule (D2), and the list is wrong the day a new tool appears.
- **`git status` before and after.** It needs git, touches the index and cannot tell the fitter's writes from a file the person had already changed; a listing works in any folder.
- **Always creating the missing shared component or token.** It grows the person's design system without being asked; the fitter proposes it instead.
- **A harness that renders one component of the project alone.** A different harness per technology is the list D2 rules out; the person's own page or preview gives the address.
- **kitvas writing the files itself from a template per technology.** The same list again, and a template cannot follow a project's own conventions the way an agent reading its nearest files can.
