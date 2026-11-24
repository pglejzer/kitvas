# 0049. Editing session and version

Date: 2026-11-23. Status: accepted, changed in part by ADR 0058. Spec: `docs/specs/2026-11-23-kitvas-stage-4a-editor-core-design.md`, decisions 2, 7 and 10.

## Context

Claude must see the person's edits at once, so edits cannot wait in the browser for a save. A version per edit would flood the compare view. A version is also what the person compares and returns to.

## Decision

- **A session is one version.** The first edit of a session adds the next version (v(n+1)) through the drafts module, and every later edit goes into that same version. `draft.json` gets an optional `edit` field, `{ version, startedAt }`, written when the session starts. A session is open only while `edit.version` is the latest version.
- **Every edit is written at once.** Each request changes the files on disk; nothing is held back until a save. If the browser closes, nothing is lost.
- **The session ends in two ways.** The person presses "Save version" (`POST /api/v1/drafts/{slug}/edits/end`), or Claude starts a newer version, which makes `edit.version` no longer the latest. The next edit then starts a new version.
- **A stale request is refused.** A request on a version that is not the latest throws `EDIT_STALE_VERSION` (409; `slug`, `version`, `latest`), so an edit never lands in an old version.
- **The route always answers 200 with an outcome.** `applied`, `conflict` or `refused`, so one schema covers every result. `applied` carries the new ETag of each written file, whether a session started and whether another writer's change was merged. `conflict` carries the file's current text and ETag, and says `changed` or `gone`.
- **ETags per file.** A request names the ETags it was based on. When they differ and the edited place still holds the expected `before`, the edit is applied (`merged`). When the place changed or is gone, nothing is written and the person chooses: keep mine (the same gesture again with `force`) or keep theirs.
- **All files or none.** All new texts are made and checked in memory first: TSX through the compiler (`jsxDev`), SCSS by balance of braces, strings and comments. Only then does `DraftStore.replaceAll` write each file to a temporary file and rename it over the original; if a rename fails, the files already renamed get their old text back. The first write of a session happens in the new version's folder.
- **Claude sees it live.** The studio watches the draft's `src/`, publishes a `source` event and rebuilds in a warm builder, then the editor reloads its frame at the new version. An edit by Claude shows up in the session's change list as "changed by Claude" and cannot be undone from the editor.

## Consequences

One session gives one version to compare, with every edit of it undoable in order. Because the version exists from the first edit, a draft carries a half-finished session if the person walks away; the next "Save version" or Claude's next version closes it. The `edit` field and `replaceAll` are new to the drafts module; older drafts without the field are simply not in a session.
