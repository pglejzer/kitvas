# 0048. Edit operations

Date: 2026-11-23. Status: accepted. Spec: `docs/specs/2026-11-23-kitvas-stage-4a-editor-core-design.md`, decisions 4, 5, 6, 7 and 10.

## Context

The studio's editor changes a draft's source from a panel. The person must get a readable diff, Claude may edit the same files at the same time, and a plain edit must not need a model or the network.

## Decision

- **A closed set of operations.** `src/edit/domain/ops.ts` defines `setProp`, `removeProp`, `setText`, `setStyle`, `removeStyle`, `addClass` and `removeClass`, checked by one zod schema. A request carries at most `MAX_OPS` (20) of them. Nothing outside the set can be written.
- **Exact inverses.** Every operation carries what it replaced: `before` (the old value, or `null` when it was absent), `after` (the prop it follows, so an inserted prop goes back to the same place), `newRule` and `dropRule` for SCSS rules. `inverse(op)` and `inverseAll(ops)` need no file. Applying an operation and then its inverse gives the file back byte for byte; round-trip tests hold that for every `.tsx` and `.scss` fixture and Base file.
- **kitvas writes the code, not an AI.** `applyTsx` and `applyScss` are pure functions over the text. They change only their own span, keep quotes, indentation and line endings, and return the new text with the changed spans. They have no parser dependency: a small reader of one JSX opening tag and a small editor of top-level class rules.
- **Refusals, never guesses.** An operation that cannot be applied exactly is refused with a reason: `computed` (a prop written as an expression), `spread`, `not-found`, `ambiguous`, `no-text`, `has-class`, `no-classname`, `utility`, `nested`, `invalid`. A refusal changes no byte, and an expression is never replaced by a literal, also after "keep mine".
- **`before` is checked.** The value a panel saw must still be on the file, or the apply answers `conflict`. `force` skips the check and is sent only after the person chose "keep mine".
- **Finding the element.** The server finds the element again in the current text on every edit, through the compiled JSX (`EditCompiler.jsxDev`), never by an old line from `ids.json`. A change by someone else to another place of the same file is applied silently; only a changed `before` or a gone element is a conflict.
- **Undo is the person's history.** Undo sends `inverseAll` of a gesture through the same path, on the current text. It never restores a snapshot, so another writer's lines are never undone.
- **Ask Claude.** A refused edit, and a conflict where the element is gone, offer "Ask Claude". It posts a note to the inbox with the element, the wanted change in words and the reason. The plain path never calls a model; Claude is asked only when the person chooses to.

## Consequences

Edits are deterministic, testable and work offline. The set is small on purpose: structure (insert, move, delete) and per-width rules come in later parts, as new operations with their own inverses. A case the set cannot express is refused and shown, which the person can hand to Claude.
