# 0045. Rework and craft draft kinds

Date: 2026-11-23. Status: accepted. Adds to `0020-checks-and-findings.md` and `0043-guidelines-with-ids-and-sources.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-3b-rework-craft-design.md`, sections 5 and 6.

## Context

Until stage 3b a draft is one thing: a screen built from a brief. The owner wants two more kinds of work: a better version of an existing page (`rework`), and a few sketches of a missing component, icon or logo (`craft`). A general system with its own model, steps and studio view per kind would rebuild drafts, render and studio just after they settled, and would put `compose` at risk.

## Decision

- **Kinds.** `draft.json` gets `kind`: `screen` (the default, so old drafts read unchanged), `rework` or `craft`. A `rework` draft carries a `rework` block (`source`: `url`, `image` or `figma`), a `craft` draft a `craft` block (`subject`, `name`, `description`, `picked`), and a `screen` draft neither. Any other mix is `DRAFT_INVALID`. `schemaVersion` stays 1. A command that needs another kind fails with `DRAFT_KIND`.
- **`rework` is compose with a captured original.** The original lives in `before/` next to the version folders, not inside a version: `source.json`, screenshots or images, `inventory.json`, and for a URL source `problems.json`. The `protected.json` list is proposed by kitvas from the inventory, confirmed once by the person, and changed afterwards only on the person's word. From there the steps are compose's.
- **Rule ids stay in the book's checks.** The two rework checks are `ux/protected` (fix: a protected item is missing from the version at 390 or 1280) and `ux/before-problems` (review: a rule that fired on the original fires as often or more on the version). The spec's `rework/*` names are not used because a book entry's `check` field has no `rework`. The same holds for the craft rules: `ui/icon-grid`, `ui/icon-stroke`, `ui/icon-colour`, `ui/icon-small`, `ui/logo-mono`, `ui/logo-small` and `ui/logo-contrast`. They have book entries with thresholds like any rule.
- **`craft` has its own small shape.** It is one thing in three sketches, not a page of sections. Examples are captured into `reference/` (screenshots and images, never a problems list). Sketches `A`, `B` and `C` are separate files under `src/tsx/sketches/`; kitvas generates the board entry. `craft pick` makes the next version with only the picked sketch, and refining goes through versions as in compose.
- **Example, not copy.** An example gives style and idea; a sketch is never traced. A logo from a third-party site gives style only.
- **The project's kit comes first.** Both skills start with `kit detect`, work in the project's own kit whatever its source, offer to learn an unlearned design system before anything else, and use Base only when there is none.
- **Figma** is read only by the skill, through the person's own MCP, and passed to kitvas as an image and a note (ADRs 0035 to 0039).

## Consequences

`compose` is untouched: old drafts and the screen path run as before. A rework shows a measured "better" for URL sources and honest silence for image and Figma sources. The cost is a second and third kind to keep in step through drafts, checks, render and studio, and a kind check at the start of each command.
