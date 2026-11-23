# src/edit

The editor's write-back (stage 4a): operations from the studio's panels applied to a draft's TSX and SCSS by kitvas itself, without an AI. Spec: `docs/specs/2026-11-23-kitvas-stage-4a-editor-core-design.md`.

- `domain/` is pure: text in, text out, no I/O. An apply function returns the new text and the changed spans, or a refusal (`domain/types.ts`), never a part of a change.
- An edit touches only its own span. Never reformat, re-indent or re-quote anything else; keep the file's line endings (CRLF stays CRLF) and its indentation.
- Every operation has an exact inverse (`domain/ops.ts`). Applying an operation and then its inverse gives the file back byte for byte; the round-trip tests hold that for every fixture file.
- The JSX reader skips strings, template literals, comments and JSX inside `{…}`: an apostrophe in JSX text never starts a string. It never executes or evaluates draft code.
- An element is found by its id. When the file is the one the build read, `build/json/ids.json` gives the place; otherwise the id is found again in the current text through `EditCompiler.jsxDev` and `readSites`/`elementIds` from the render module, never by the old line.
- A request writes all its files or none: new texts are made and checked in memory first, then written (`DraftStore.replaceAll`).
- Styles are written as `var(--kit-…)`; a raw value gets the off-kit marker after its semicolon. Never an inline `style` in TSX, never an id attribute in TSX.
- Writes stay inside the draft's own version folder.
