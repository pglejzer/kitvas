# 0065. A selection of copies, and list items at any depth

Date: 2026-11-24. Status: accepted, changed in part by ADR 0069. Changes two parts of ADR 0055 (which element is a list item, and where the list ops reach) and one of ADR 0059 (the `rect` and `reorder` messages, and that an element inside a list item cannot move). Builds on ADR 0060 (a copy's path through its lists). Plan 18c, agent A.

## Context

The owner, after a live test on a pricing page of three cards whose 19 feature rows come from a list inside a list. The causes, read in the code:

- Every copy a `.map` renders carries one element id. The selection was a list of ids plus one number, the place of the one picked copy. Ctrl with a click on a second row of the same card named the id that was selected already, so it unselected; Ctrl with the rectangle named ids only, so the rows of all three cards were selected.
- The list ops of ADR 0055 found their list with `findList`, which reads one `.map` over an array of the file. A feature row stands in `plan.features.map(…)` inside `plans.map(…)`: its Delete was refused as `list-not-literal`.
- That refusal was put into the store and shown nowhere near the canvas. A key whose action was off did nothing at all.
- Any element inside a callback was "the item". Delete on a card's heading removed the whole card.
- The structure said `in-expression` for every element inside a callback, so no part of a card could move, be duplicated or be deleted as an element.

## Decision

- **A selected thing is an element and a copy.** The store keeps `selection` (ids) and `copies` (`CopyRef`: the id, `item` as the place among the rendered copies of the id, `path` as the place in each list around it, outer first). A click takes the copy it was on. Shift, Ctrl or Cmd with a click adds that copy, or takes it away when it is chosen already; an id whose last chosen copy left leaves the selection. The rectangle gives the copies it took (`rect {picks, add}`). A row of the layers list, a key and every other writer of `selection` name the element itself: no copy, so every copy. The store drops the copies of ids that are not selected, and a selection written without copies clears them. At most 200 copies. The frame hears `select {ids, copies}` with each chosen copy's `item`.
- **A list item is the root element a `.map` callback returns.** Only that element takes the item actions. The structure map says it for each element: `lists`, the ids of the list roots around it, outer first (`null` when a list cannot be counted), and `item` for the root of its innermost list when the arrays are literals of the file.
- **The list ops name an item by its path.** `moveItem`, `duplicateItem` and `removeItem` take an optional `path`, the item's place in each list, outer first, at most 8 deep; the levels and their arrays are read as in ADR 0060 (an inline array, a same-file `const`, or a field of the outer item the path names). `moveItem` takes `toPath` too: in the item's own array it is the place the item has afterwards, in the same list of another parent it is the place among that list's items as they are, and the item's text is taken out of one array literal and written into the other in one op. Without `path` an op is exactly the op of ADR 0055. An op on an element that is not its list's root is refused with the new reason `not-list-item`. Each op still rewrites only the touched items' text, and the inverse is exact.
- **Inspect answers for the picked copy.** `GET …/inspect?path=` says whether the element is its list's root (`list.root`), how many items the list of that copy has (`list.count`), and the copy's place among all copies of the id with their number (`list.copy`, `list.copies`). A list inside another gives no item texts (`texts: null`): its texts go through the text sources of ADR 0060.
- **Several chosen items of one list root are deleted together.** One gesture with one `removeItem` for each, later places first, so one undo brings all back. Move and Duplicate need one item and say so. When the page shows another number of copies than the arrays hold, the copies cannot be told apart and the actions are off with the reason.
- **A part of an item is an element of the template.** An element inside the callback's JSX that is not its root moves, duplicates and is deleted as an element: only its own place decides `movable`, and what stands in an expression's own place (the callback's root, a branch of a condition) stays `in-expression`. The change shows in every item, and it is said three times: the menu's labels ("Delete from every item"), the note above the properties ("A change shows in all 3 items", with a control that selects the item on the same copy), and a line over the canvas once it is written.
- **Nothing is refused in silence.** One line over the canvas (`role="status"`, gone after 5 seconds, a later one takes the place of the one shown) says why: a key or a menu action that is off, an edit, a drop or a moved item the server refused, a handle that wrote nothing, an element lost after another writer's change. A refusal the properties panel shows at its own row is not said twice. The Ask Claude offer of a refused edit stays in the panel, and its words name a list item by its path.
- **Select all.** With a selection, Ctrl or Cmd with A selects the siblings of the first selected element: for a list item on a chosen copy the items of that one list, for a part its siblings on the same copies. With nothing selected it selects the sections.
- **Copies across an edit.** A copy follows its element through a rename and leaves with an element that is removed. A moved item keeps the selection on the place it went to. After an undo or a redo done by a patch, copies named by a path are dropped, since the places may be others now; the selected elements stay.

## Turned down

- **One copy index for the selection**, the `item` number of ADR 0055 kept as it was. One number cannot name three rows of one card, nor rows of two elements, and a Ctrl click on another copy of a selected id can only replace it or unselect it.
- **List actions on any element inside a callback**, the rule of ADR 0055. Delete on a heading removed the card around it, and nothing on the screen said that a heading is not an item.
- **Refusing Delete on a part with a message.** A heading that no card needs could then only be removed by Claude. The template is plain JSX the editor writes everywhere else.

## Consequences

Ctrl with a click and with the rectangle select rows of one card. Delete on a feature row changes that plan's array only. A row moves into another card with one op and one undo. Delete on a card's heading removes it from every card and says so.

The page can name only what the frame names: a copy with neither `item` nor `path` is the element itself. A copy known by its path alone (after a move into another list) is outlined on every copy until the next pick or inspect gives its `item`.

`list.copy` and `list.copies` count what the arrays hold. A list drawn for only some outer items (behind a condition) shows fewer copies than that, and the item actions are then off with the reason instead of acting on a guessed place.

A right click names the copy under the pointer as a click does: the frame's `menu` message carries `item`, `path` and the element's box. A copy that is not selected yet becomes the selection, as with a plain click, and the menu acts on it at once; its items are drawn again when the facts of what it selected arrive. The box lets the note form stand beside the element instead of over it.

After another writer's change the selection is written again without copies, so the chosen copies are forgotten and the elements stay selected.

`findList`, `listInfo` and `itemTexts` keep their meaning for a list in no other list. The rules (the copies of a selection, select all, the paths of items, the ops, what a part is, when a refusal is said) are pure functions with tests; the note over the canvas is checked live.
