# 0069. A click in a list takes the row first

Date: 2026-11-25. Status: accepted. Changes in part ADR 0065 (what a click on a part of a list item picks). Builds on ADR 0066 (the frame draws and names copies). Plan 18d, agent C.

## Context

The owner, after a live test on the pricing page of three cards from `plans.map`, each with feature rows from `plan.features.map`: a click on a row's text selected the text, and Delete then removed that text from every row. He expected the row. Under ADR 0065 a click takes the deepest marked element under the pointer, and a part of an item is an element of the template, so a click inside a row named a part of every row. The menu's labels and the note above the properties said so, but only after the click had taken the wrong thing.

## Decision

- **A press inside a list item takes the item first.** The row of a press is the nearest list item at or above the marked element under the pointer, on the copy pressed: of the lists its structure entry names (`FrameEntry.lists`), the innermost whose root the editor can write (`FrameEntry.item`). In a list inside a list that is the inner one: a click on a feature's text takes the feature row, a click on the card's heading takes the card.
- **The rule.** A plain click takes the row, unless the element under the pointer is the row itself, or that copy of the row, or something inside that copy, is selected: then it takes the element under the pointer. So the first click takes the row and the second goes into the part. With Shift, Ctrl or Cmd the row is added, or leaves when it is chosen already; only while a part inside that copy is chosen does the add key take the part under the pointer, so several parts of one row can still be chosen together. A double click takes the element under the pointer whatever is selected, so its text is edited in place as before.
- **What is not known stays as before.** When the lists around the element are not known (`lists: null`, or no entry yet while a build is on its way), or no list around it can be written, a press takes the element under the pointer.
- **Selected means outlined.** The facts read the selection as the frame outlines it: the chosen copies of an id, and every copy of an id selected with no copy (ADR 0066).
- **The frame resolves the target.** It knows the lists of each element, the copies and the selection, so `pick`, `menu` and `hovered` name the element the rule takes, with its `item` and `path`, in the shapes of ADR 0065. The studio's rules for a pick (`pickSelection`) and for the menu's selection do not change.
- **The hover follows a plain click; a right click keeps the row.** The hover outline and the `hovered` id show what a plain click would take, and are read again when the selection or the structure changes. A right click names the row before `menu` is posted, also when the row is selected already, so the menu offers the row's actions; while a part of the row is selected it names the element under the pointer.
- **Unchanged:** the rectangle (ADR 0066), the parent and child keys, a drag, and the layers panel, which selects exactly the row clicked in it.

## Turned down

- **The outermost item first, a step inward on each click.** A feature row would need two clicks, the first taking its card, and the owner's complaint was about that row.
- **The deepest element, as in ADR 0065.** One click on a row's text names a part of every row, and Delete removes it from all of them.

## Consequences

A part of a row is reached with a second click, a double click, the down arrow from the row, or the layers panel.

A selected card sends a click on its heading to the heading. So does a selected feature row inside that card, since a part of the card is chosen. A click on a feature row of a selected card still takes the row: the card is around the row, not inside it.

An element selected from the layers panel is selected on every copy, so after the row element is chosen there, a click on a part of any row takes the part.

Over a list item the hover reads the page's selected elements, at most once per frame of pointer movement. The rule (`takesRow`) and the facts it reads are pure functions with tests in `client/frame/edit/row-pick.ts`; the click, the hover and the menu are checked live.
