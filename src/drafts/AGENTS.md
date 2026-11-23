# src/drafts

Drafts in a project's workspace: `.kitvas/drafts/<slug>/`, one folder per version (`v1`, `v2`), files split by type (`md/`, `src/tsx/`, `src/scss/`, `src/json/`, `src/img/`).

- `draft.json` follows the zod schema in `domain/draft.ts`. Change the schema, never a hand-written type.
- `md/layout.md` is written by an agent and read by `domain/layout.ts`: `## <section-id>` headings with a `Purpose:` and a `Components:` line. A section id is lower-case words joined by `-`; its component and file name is the PascalCase form (`domain/names.ts`). `## shared` is reserved: its text goes to `Layout.shared` and every section context, and it is never a section.
- An optional `Screen: <kind>` line before the first section sets `Layout.screen`: `landing`, `form`, `sign-in`, `sign-up`, `checkout`, `dashboard`, `list`, `detail`, `article`, `settings`, `other`. An unknown kind is the issue `unknownScreen`. Some checks run only for a kind.
- `src/tsx/index.tsx` and `src/scss/index.scss` are generated from the layout (`domain/entry.ts`). Never edit them by hand; `kitvas layout <slug>` rewrites them.
- A problem in a draft is an `Issue` with a message key (`draftIssue.<name>` in `locales/en.json`). Only a missing draft, a draft.json that fails the schema, or a path outside the draft throws.
- All file access goes through `DraftStore`; paths inside a draft are relative with forward slashes. The store refuses anything outside the draft folder.
- A new version copies `md/` and `src/` of the latest one and never `build/`.
- This module reads kits only through `src/kit/index.ts`.
- The optional `edit` field of `draft.json` (`{ version, startedAt }`, ADR 0049) is the open editing session: open only while `edit.version` is the latest version (`app/edit-session.ts`). Never write it by hand; the editor starts and ends it.
- `DraftStore.replaceAll(slug, files)` writes several files all or none: each to a temporary file, then renames; a failed rename puts the files already renamed back. Use it when one change spans files. A path outside the draft throws `DRAFT_INVALID` before anything is written.
- Kinds (ADR 0045): `kind` is `screen`, `rework` or `craft`, and each carries only its own block. A craft draft's sketches are `src/tsx/sketches/A.tsx`, `B.tsx`, `C.tsx`; its entry is generated (`domain/craft-entry.ts`), and the next version after a pick holds only the picked sketch.
