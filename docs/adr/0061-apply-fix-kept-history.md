# 0061. Apply on a live finding, and an undo history kept across a reload

Date: 2026-11-24. Status: accepted. Builds on ADRs 0049, 0050, 0052 and 0055.

## Context

A live finding in the Checks tab (a target that is too small, text of too low contrast) could only be accepted: the person had to find the style row and work out the fix. The fix of these two kinds follows from what the frame measured and the kit's tokens alone.

The editor's undo, redo and change list lived only in the page's store, while every edit of the session is on disk at once. A reload of the page emptied them: the file kept a typed letter, the bar said "0 changes" and Undo was off. A request the studio could not save (no answer, or an error) only took its preview back, so a lost change, undo or redo looked as if nothing had been pressed.

## Decision

- **Apply is a pure fix.** A finding, the element's source view (`Inspect`) and the kit's tokens give a plan (what Apply will set), then edit ops or a reason (`client/studio/edit/live/fix.ts`). The card says the plan in one quiet line before the click ("Sets min-height to size.controlSm (32px)."), and Apply sends the ops through the history as one gesture with a label and `flash`, so the change list has it and Undo takes it back. Fixes are written at the base: every width, the resting state.
- **A target that is too small** gets `min-height` and/or `min-width`, only on its short sides: the smallest step of the kit's size scale (dimension tokens of a `size`, `sizes` or axis group) that reaches 24 px, else the raw pixels, marked off-kit. Two sides on an element without a class add the class once and make its rule once.
- **Text of too low contrast** gets the kit's opaque colour token that reaches the needed ratio against the measured background and is nearest in CIE lightness to the present colour; when the present colour is a token of a hue family (`color.brand.*`, or the first word of `color.inkSoft`), a token of that family wins if one reaches. No token reaches: no Apply. The colour maths is the page's copy in `colour.ts`.
- **The source decides.** A property the properties panel has a row for goes through `readOnlyReason` and `opsForStyle`; `min-height` and `min-width` are written in the class rule of the section SCSS by the same rules until they are rows of their own, and a Tailwind draft has no utility for them yet. A refusal, a locked element, a source that holds the fix already, or a value nothing kitvas writes can say, shows no Apply and its reason in the quiet line.
- **Everything else asks Claude.** Any other finding, and a fixable one without a fix, offers Ask Claude: an `ask` request with the element, the finding's words, the widths it was seen at, its rule and why the studio did not fix it. Accepted findings get neither. Apply (or Ask Claude) and the quiet Accept… stay on one line.
- **The history is kept per draft in `localStorage`** (the studio origin keeps its port per project): one entry `kitvas.edit.history:<slug>` that names the session's `version` and `startedAt` and holds both stacks and the session's lines of the change list (`client/studio/edit/history/keep.ts`). It is read once, when the edit state is known, and written after every change of the lists or the session. An entry of another version or session, of another format, or with one part that does not fit its shape is dropped whole and removed. Each list keeps its newest 200 steps; one step larger than 250 000 characters keeps nothing; past 2 000 000 the oldest steps go first. A storage that refuses the write loses the entry, so a reload never brings back stacks older than the file. A step carries its own renames, so a structural step read back still turns them round on undo.
- **The session's own start.** The first edit of a session reads the edit state once more for the server's `startedAt`, which names the entry.
- **Save version** ends the session: the entry is removed, and a reload after it starts empty. **Undo save** reopens the same session within its 8 seconds and writes the stacks back under it. **Undo all** undoes step by step, so the entry follows: an empty undo stack and a full redo stack, which a reload keeps.
- **A kept step that no longer fits the file** is a conflict on the server (`before` and the ETags) and shows the conflict panel; the step stays on its stack until the person chooses.
- **A save that fails is said.** No answer or an error leaves both stacks and the change list as they were and sets `failed` in the store, which the bar's session line shows ("The change could not be saved. Try again.") until the next request is answered.

## Consequences

The two most common live findings are one click away and as reversible as every other edit. The kept history makes a reload harmless, at the cost of a stored copy that must match the op shapes: a new op kind needs its fields in `history/keep-shape.ts`, and a test holds the table to every kind. `min-height` and `min-width` are not rows of the properties panel yet; when they become editor properties, the target fix goes through the panel's rules without change.
