# 0052. Element identity

Date: 2026-11-23. Status: accepted. Spec: `docs/specs/2026-11-23-kitvas-stage-4b-editor-structure-design.md`, decisions 7 and 15.

## Context

An element's id is its JSX path of tags, with a `.n` suffix for the n-th same tag under one parent. A move, a wrap or an unwrap changes the ids of the moved element and of its neighbours. The selection, the history, the change list and later versions must follow the element anyway, or the person loses their place after every structural edit.

## Decision

- **A rename map from offsets.** Every write is a set of splices, so each old offset maps to a new offset (`OffsetMap`). With the compiled sites before and after, `renameMap` takes each element's old `<`, maps it, finds the element at the new offset with the same tag, and records old id to new id. It lists every element whose id changed, not only the moved one.
- **The answer carries it.** An applied request answers with `renames` (old id to new id), `created` (ids of inserted elements) and `dropped` (props a replace could not keep). Ids dropped with a removed element are absent from the map. The editor remaps its selection, hover, history, change list and hidden elements through it, and selects the created elements when the gesture asked for it.
- **A rename log per version.** kitvas appends each request's `{at, renames, created}` to `edit/renames.json` in the version's folder (`src/drafts/app/rename-log.ts`). The build does not read it. A file that is broken or has a wrong shape reads as empty. `idAtStart` walks the log back to find an id as it was when the session started; an element created in the session has none.
- **Matching after another writer.** When Claude changes a file (a `source` event by another writer), the editor holds ids that may no longer fit. `matchIds` picks, for each held id missing from the new structure, the entry in the same file with the same tag, the closest JSX path and the most equal text and props. A score under a threshold gives no match: the selection is dropped and the panel says Claude changed the section. This is best effort and never writes anything.
- **Reset to session start.** "Reset" replaces an element with its source in the version before the session, found through the log. An element that did not exist then is refused with `not-in-session`, and the menu offers "Delete" instead.
- **No marker in the code.** Identity lives in offsets, the log and the build's sites. kitvas never writes an id attribute or any mark of its own into a draft.

## Consequences

Selection and history survive a move, a wrap and an unwrap without any marker in the code. After Claude's edits the match can fail; the person then selects again. The log is small and also lets a later timeline follow an element through a session.
