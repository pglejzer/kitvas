# src/drafts

Drafts in a project's workspace: `.kitvas/drafts/<slug>/`, one folder per version (`v1`, `v2`), files split by type (`md/`, `src/tsx/`, `src/scss/`, `src/json/`, `src/img/`).

- `draft.json` follows the zod schema in `domain/draft.ts`. Change the schema, never a hand-written type.
- `md/layout.md` is written by an agent and read by `domain/layout.ts`: `## <section-id>` headings with a `Purpose:` and a `Components:` line. A section id is lower-case words joined by `-`; its component and file name is the PascalCase form (`domain/names.ts`). `## shared` is reserved: its text goes to `Layout.shared` and every section context, and it is never a section.
- `src/tsx/index.tsx` and `src/scss/index.scss` are generated from the layout (`domain/entry.ts`). Never edit them by hand; `kitvas layout <slug>` rewrites them.
- A problem in a draft is an `Issue` with a message key (`draftIssue.<name>` in `locales/en.json`). Only a missing draft, a draft.json that fails the schema, or a path outside the draft throws.
- All file access goes through `DraftStore`; paths inside a draft are relative with forward slashes. The store refuses anything outside the draft folder.
- A new version copies `md/` and `src/` of the latest one and never `build/`.
- This module reads kits only through `src/kit/index.ts`.
