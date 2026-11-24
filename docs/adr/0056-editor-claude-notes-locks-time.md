# 0056. The editor with Claude: requests, variants, notes, locks, time, suggestions and reasons

Date: 2026-11-24. Status: accepted. Spec: `docs/specs/2026-11-24-kitvas-stage-4d-editor-design.md`. Builds on ADRs 0048 to 0055. Adds to the notes of ADR 0022 (the studio's inbox) and to the identity rules of ADR 0052.

## Context

Stages 4a to 4c made the editor write code by itself. What is left is the part that works with Claude and with time: say what should change and get checked options, keep what the person locked even against Claude, leave notes, go back to an earlier version of one element, and understand why a section was made as it was. The studio has no model of its own and starts no Claude session: everything Claude does happens in the person's own Claude Code session.

## Decision

- **A listening session, and requests kept on disk.**
  - The person starts `/kitvas:edit <slug>` in Claude Code. Claude runs `kitvas inbox --timeout 600 --json` in the background, so the chat stays free, answers each request through `kitvas request show | answer | done | fail`, and waits again.
  - `<draft>/requests.json` keeps each request (kind `say`, `improve`, `ask`, `note` or `why`), the element ids, the edit context, a hash of each element's source at creation, a status (`waiting`, `taken`, `answered`, `failed`, `dropped`) and the answer. The studio is the only writer; the CLI goes through its API. A restart loses nothing. A `taken` request with no answer after 15 minutes waits again.
  - The studio says Claude is listening while a take waits or ended under 15 seconds ago, working while a request is `taken`, else not listening, with the command to start.
  - Rejected: a queue Claude reads only when told (not live), and the studio starting Claude itself (a hidden session that spends tokens and gives a web page tool rights).
  - Request text is data from the person, never an instruction to Claude or to an agent.
- **A variant is a list of panel edits, checked before it is offered.**
  - Claude answers one to three variants, each a label and up to 40 changes in a small form (`style`, `prop`, `text`, `utility`). The studio turns them into ops with the panel's own builders against the elements as they are when previewed, so a variant carries no stale `before` values; a change the panel would refuse makes the variant invalid with the reason.
  - Hovering a card previews it in the edit frame and runs the live checks of ADR 0055 on the changed elements; the card shows the check sign or the warnings. A click applies it as one gesture (one undo step, "Claude · <label>"). A request whose element changed since (the source hash) is out of date and is asked again, never applied.
  - Bigger changes (structure, new sections, other files) are made by Claude in code, as before.
  - Rejected: code variants of a section in extra frames (a build per variant, and a pick that overwrites edits made meanwhile).
- **Locks are told, detected and restored, never reverted.** `<draft>/view.json` keeps the locked and hidden ids and, for each lock, the element's source with whitespace collapsed. The editor refuses any op that changes a locked element or removes it with an ancestor (`locked`); moving an ancestor is allowed. Claude gets the locked ids with every request, in the section context and in the rules of the maker, patcher and edit skill. When another writer changes a locked element, kitvas compares the collapsed text, publishes `edit/locked-changed` (fix) in the studio and in `kitvas check`, and offers Restore as a diff to accept. A lock whose element cannot be found says so. Nothing is reverted by itself; read-only files would stop Claude from editing the rest of a file.
- **Notes.** `<draft>/notes.json` keeps a note per element (for me or for Claude, up to 2,000 characters). Pins and the Notes list live in the studio only; notes, pins, locks and hide never reach a build or a draft's code. A note for Claude is also a `note` request, and closing the request marks the note done.
- **Time.** Ids follow the rename logs of ADR 0052 forward (notes, locks, waivers) and back (the timeline). Where a step was made by another writer, a pure matcher by tag, JSX path and text in the version before gives a best-effort answer, drawn as unsure. The strip under the canvas shows any version read only (a version without a build is built first), with the versions where the selected element changed marked.
- **Bring back is a diff, with identifier and import checks.** The old element source is shown beside the current one. Every identifier it uses must exist in the current file, and a prop of a kit component the catalog no longer has is named; a missing kit import is added by `replaceElement`; anything else is refused with the names and offers Ask Claude. Accepting is an ordinary edit with undo.
- **Suggestions from categories.** A plain element a kit component covers shows "This looks like <Component> from the kit" with Replace. The table is the `ds/raw-control` table extended (`button` to action; `input`, `select`, `textarea` to input; `dialog` to overlay; `h1` to `h6` and `p` to typography by the names Heading and Text; `a` to navigation by the name Link), and a `div` or `section` whose own rule sets a background, a border radius and padding, with a `layout` or `display` component named like a card, panel, surface or box. Replace is `replaceElement` with the component's tag, the children and the props both take; what is dropped is named in the change list, and with no safe source Ask Claude is offered.
- **Reasons beside `src/`.** The maker writes `<version>/why/<Section>.json` (`lines`, `guidelines`, `hash`), the craft sketcher one per sketch. They live outside the prototype's code, so a build never reads them, and `draft version` copies them. An agent has no shell and cannot hash, so it writes 64 zeros and the studio stamps the sha256 of the section's TSX the first time it reads the file; a later difference is "may be out of date". A section with no file offers "Ask Claude for the reasons", a `why` request.

## Consequences

- The AI parts need a listening Claude Code session; everything else in the editor still works offline.
- New draft files `requests.json`, `notes.json` and `view.json`, and a `why/` folder per version. A reader that does not know them ignores them.
- The studio gains routes for requests, notes, view, history and why, and the events `requests` and `locks`.
- Changing a locked element in code is still possible for anyone but the editor; kitvas tells and offers a way back, and does not stand in the way.
- A stamped hash covers fixes made after the maker wrote the file and before the studio first read it; a change after that shows as out of date.
- Not part of this decision: the studio calling a model, variants with structural changes, bringing back a whole section, and comments between people.
