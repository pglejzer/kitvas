# 0064. Delete a draft, with a way back

Date: 2026-11-24. Status: accepted.

## Context

There was no way to delete a draft: `kitvas draft` had `new | list | show | version`, the studio's gallery only showed drafts, and the only way to remove one was to delete a folder under `.kitvas/drafts/` by hand. The editor is held to the standard of a real design tool, and in one a delete never loses work at once. A draft holds versions that exist nowhere else, and drafts are not committed by everyone.

## Decision

- **A delete moves, it does not destroy.** `.kitvas/drafts/<slug>/` is moved as a whole to `.kitvas/trash/<slug>~<stamp>/`. The stamp is the UTC time of the delete as `20261124T101530123Z`: safe in a file name on Windows and sorted by time. One move, with the retry of `adapters/rename-retry.ts`, since Windows refuses a move for a moment while a scanner or a watcher holds a file. When the move still fails, nothing is half moved and the answer is `DRAFT_LOCKED`: another program holds the draft's files.
- **`deleted.json`** in that folder holds the slug, the title and the time. A copy without a readable one is still listed, by its folder name and its `draft.json`.
- **Restore** brings back the newest deleted copy of a slug. A live draft of that slug refuses it with `DRAFT_EXISTS`; no deleted copy is `DRAFT_NOT_FOUND`.
- **Purge** removes deleted copies for good, one slug's or all. It never touches a live draft. It is a separate step with its own confirm, and the plugin's skill runs it only after the person says yes to losing the draft for good.
- **The surfaces.** The CLI has `draft delete`, `draft restore`, `draft list --deleted` and `draft purge <slug> | --all`. The studio API has `DELETE /api/v1/drafts/{slug}`, `GET /api/v1/trash`, `POST /api/v1/trash/{slug}/restore` and `DELETE /api/v1/trash/{slug}`, and the `drafts` event tells open pages. A delete first stops the draft's running build and check jobs and lets its warm build end, so no program of kitvas holds the folder. The gallery card has a quiet control and a confirm, the card leaves with a message that offers Undo for 8 seconds, a "Deleted" filter lists what can be restored or removed for good, and a page open on a draft that is deleted elsewhere says so and offers Restore.
- **What stays.** A craft draft's additions belong to the kit and stay. Requests, notes, waivers and the view sit inside the draft's folder and move with it; they are back after a restore.

## Turned down

- **A delete that removes the folder at once behind a confirm.** A wrong click, or a wrong slug typed by an agent, would lose versions that exist nowhere else.
- **A `deleted` flag inside `draft.json`.** Every reader of drafts, in this plugin and in the person's own tools, would have to know to skip it, and a forgotten reader would show or build a deleted draft.

## Consequences

`DraftStore` gains a `trash` part, and the studio's `Jobs`, `WarmBuilder` and live loop gain a way to let a draft's work end before its folder moves. Disk is not freed by a delete; `draft purge` does that. A trash folder name that kitvas did not make is never read or removed.
