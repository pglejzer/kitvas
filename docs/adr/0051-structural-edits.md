# 0051. Structural edits

Date: 2026-11-23. Status: accepted. Spec: `docs/specs/2026-11-23-kitvas-stage-4b-editor-structure-design.md`, decisions 1, 2, 3, 4, 5, 6, 8, 9 and 10. Builds on ADR 0048.

## Context

In 4a the person changes how an element looks. In 4b they change what the draft is made of: move, insert, delete, wrap and replace elements, and reorder sections. The rules of ADR 0048 still hold: a readable diff, no model for a plain edit, Claude may write the same files, and undo must not touch another writer's lines.

## Decision

- **The set of operations grows, and stays closed.** `moveElement`, `insertElement`, `removeElement`, `wrapElements`, `unwrapElement`, `replaceTag`, `replaceElement`, `resetElement`, `moveSection`, `insertSection` and `removeSection` join the seven of 4a in `src/edit/domain/ops.ts`. A place is an anchor element and `before`, `after`, `first` or `last` (the last two mean inside the anchor). Duplicate, paste, cut and the palette are compositions of these. A request carries at most `MAX_OPS` (50) operations.
- **No parser package.** The 4a reader already walks an element from its opening tag to its closing tag. It now also gives the element's full span and its direct children (elements, `{…}` expressions, text). A spike over the fixtures and kits found every span and every result compiled.
- **Ids in a request name the elements as they were before it.** The server carries each operation's effect forward and translates the ids of the later operations, so a client can send a request without computing renames.
- **The server makes the inverse.** An inverse of a structural operation depends on where things stand after it. An applied request therefore answers with exact inverse operations in the ids after the request: the 4a inverse when every operation is a 4a one, otherwise a `patch` (find and replace hunks per file) and a `file` operation (a whole file, or its removal, with the hash it must have). The history stores what the server sent. Undo goes through the same path on the current text, so another writer's lines are kept.
- **A hash guards the subtree.** Each structural operation may carry the hash of the source it touches, as the editor last saw it. The element is found again by id on the current text; a different hash is a conflict, never a silent write. `force` skips it after "keep mine".
- **What a moved subtree may carry.** A subtree with identifiers in its `{…}` expressions moves only within one function body. Across functions, sections and drafts only kit components, lowercase tags and literals may move; pasted text follows the same rule and must read as one element. Elements inside a `{…}` child (a `.map`, a condition) are not movable and not drop targets: they are refused with `in-expression` and "Ask Claude". JSX in a prop's value is a slot: its root stays, its descendants move inside it. The root of a section can be wrapped, unwrapped and replaced, never moved or deleted. Text mixed with elements takes no drop slots. An interactive element never goes inside another.
- **Kit imports follow use.** After a structural change the file's import from the kit entry names exactly the kit components the file uses. No other import is touched. A file with no kit import gets one line after its last import.
- **Formatting.** A moved or inserted subtree is re-indented to its new depth with the file's own indent unit and line endings. Lines outside the splice never change. Remove then insert at the same place gives the file back byte for byte.
- **Classes travel with a subtree** to another section: the rules of the classes it uses are copied to the target's SCSS, and removed from the source's when nothing there uses them. A different rule of the same name is refused with `class-clash`. The whole move is one atomic request (ADR 0049).
- **Sections** are edited through `md/layout.md`, from which the build generates `index.tsx`: only the `## <id>` blocks move, are added or are removed, with the section's TSX and SCSS files. A section from another draft needs the same kit id and must not use that draft's own additions. A removed file is moved aside first, so a failed write puts it back.
- **Insert sources.** A kit component comes from its catalog example, with the imports it names. An icon is the kit's icon component with a name. A component with no example is inserted with the catalog's default props, or refused when a required prop has none.
- **Refusals.** `in-expression`, `section-root`, `slot-root`, `scope`, `class-clash`, `not-accepted`, `mixed`, `nested-interactive`, `not-siblings`, `no-element-children`, `unknown-component`, `kit-mismatch`, `not-in-session` and `into-self` join the list of ADR 0048. A refusal changes no byte.
- **Never position.** No operation writes `position: absolute`, `fixed`, offsets or a transform. Layout changes go through the kit's layout components and their props.

## Consequences

Every structural change is a small splice that undo reverses exactly, and Claude can edit other lines in between. The price is a server that tracks where each element goes inside a request, and a reader that is ours to maintain. Lists and conditions stay out until a later part; the editor says so and offers "Ask Claude".
