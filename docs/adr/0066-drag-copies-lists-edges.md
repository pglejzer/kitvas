# 0066. Gestures in the frame: copies, lists and a container's edge

Date: 2026-11-24. Status: accepted. Changes three parts of ADR 0059: what the rectangle takes, where a list item can go, and which container takes a drop near an edge. Builds on ADRs 0059 (pointer gestures), 0060 (a copy's path through its lists) and 0065 (the messages that name copies). Plan 18c, agent B.

## Context

The owner, after a live test on a pricing page of three cards whose 19 rows come from a list inside a list: a drag should move a row into another card and change the order inside a card, it should look cleaner, and Ctrl with a click or with the rectangle selected the rows of all three cards. The causes, read in the code:

- Every copy a `.map` renders carries one element id, and a selection named ids. Three rows of one card were "the row element", so all 19 were outlined, and the rectangle posted each id once.
- The rectangle took the outermost elements it touched that did not hold it whole (ADR 0059). One that started beside the content column crossed the column's container and took the whole container.
- A list item had places only among copies inside one common parent, with copy `n` of the id as item `n`. Both are wrong for rows in three lists, and an item of a list inside a list did not drag at all.
- A slot came from the pointer's place alone. A few pixels under a grid the pointer is over the section, so a note pulled to the end of the grid landed among the section's children.
- While an element was dragged, the handles, the selection's label, the hover outline, the outlines of the other selected elements and the marks stayed on the page.
- The handles of a 50 by 20 px button covered the button.
- A few gestures were lost in a live test (a press and drag that only selected, a handle whose preview stayed). One cause was measured: the browser handed the release of a press that began in the frame to the page, with the frame's element as its target, so the frame never heard the end of its own gesture.

## Decision

- **The frame draws a selection by copy.** An id with chosen copies in `select` is outlined on those copies only, an id without any on every copy. A chosen copy the page does not have, because a build is on its way, keeps every copy of its id. A pick names its copy by `item`, its place among the elements that carry the id, and by `path` when the structure lists the `.map` lists around it (`FrameEntry.lists`). The handles and the selection's label stay only for exactly one copy: one id with one chosen copy, or one id that a single element carries.
- **The rectangle takes whole what lies inside it and goes into what it only touches.** From the outermost elements inwards: an element that lies fully inside is taken whole, and nothing inside it; an element covered only in part is not taken, and each of its children gets the same test; an element covered only in part that has no element children is taken. A container that holds the whole rectangle is never taken for it. The rectangle posts `picks`: every copy it took, in document order, with `item` and `path` as a pick has them, at most 200. While it is pulled, the same copies are outlined.
- **A list item drags among the lists of its id.** The copies that stand in one copy of the list root one level out are one list, and copy `n` of a list is item `n` of its array. The pointer picks the list, then the place in it, before or after a copy. The drop posts `reorder {id, from, to}` with paths: in the item's own list `to` counts the item as taken out first, in another list it is the place among that list's items as they are. From the start of the drag every list that can take the item has a faint outline, and the one that takes it a stronger one. An element whose entry says `item` drags as an item at any depth.
- **A part of a list item stays in its item.** An element inside an item's template that can move drags as an element. Its slots stay inside its own copy of the item, and the preview moves the same part in every copy of the item.
- **A container is left only past its edge.** While the pointer is inside the dragged element's own parent, or within 32 px on the screen outside its box, the slot is looked for in that parent first: nothing around the parent takes the drop. Only when the parent offers no slot there, and further away, the elements under the pointer decide as in ADR 0059. The same holds for an item and its own list.
- **A drag draws three things.** From its start to its end the frame draws the dragged copy dimmed, the line of the slot, and a soft outline around the container or the list that takes the drop. The handles, the selection's outlines and label, the hover outline, the marks, the note pins and the live numbers leave the page and come back when the drag ends. With a slot under the pointer the cursor is `grabbing`, with none there is no line and the cursor is `not-allowed`; the cursor is one rule in a style element of the frame's own. The page scrolls while the pointer is within 48 px on the screen of the frame's top or bottom edge, from 60 px a second where the zone begins to 900 at the edge, and the slot follows.
- **A small element keeps a place to press.** Under 40 px on the screen in a direction, the size handle for that direction stands outside the box, with its zone starting at the edge. The corner goes out with either.
- **Ctrl or Cmd with A is the editor's.** In edit mode the frame posts the key `select-all` and the page's own select-all does not run. Never during an inline text edit.
- **A lost gesture is logged.** The drag session and the handles keep the last 20 changes of state in memory, each with why a gesture ended. A gesture that ends without its drop or its write posts them once, as `gesture-log`. The log also hears a build taken under a press or a drag (`swapped`), a page that is left (`unloaded`), and a press on the handles' overlay with no handle under the pointer (`no-spot`). The log changes no rule of ADR 0059 on when a gesture ends.
- **A release the page hears is passed on.** The page listens for a release whose target is a card's own element and sends that card `release`: the point in frame pixels, and whether Shift and Alt were held. A press, a drag or a handle of the frame's own pointer ends there as with a release the frame heard itself, so the drop or the write lands. A frame with no press of its own does nothing with it, which is the case at the end of every drag that began on the page.
- **Still no position.** Nothing here writes `position`, an offset, a transform, an inline style or an id into the draft. The outlines, the cursor rule and the log are the frame's own.

## Turned down

- **The outermost touched element**, the rectangle's rule of ADR 0059. It takes a container the rectangle only crosses, so a rectangle that starts beside the content takes the whole column. By ids it also cannot tell three rows from nineteen.
- **Slots from the pointer's place alone.** A drop a few pixels past a container's edge leaves the container, and inside it the last pixels at the edge mean "beside it". A person aims at a box, not at its inner part.
- **A fix for the lost gestures without a cause.** The `blur` rule and the rule for a move with no button down were measured and cleared. Changing them on a guess would trade a rare loss for a drag or a rectangle that never ends. Only the cause that was measured, a release the page heard, got a rule.

## Consequences

A rectangle around two cards takes the two cards, one across three rows takes those three rows, and one from one card over into the next takes the rows it reaches in both. A rectangle over a part of a container where none of its children is takes nothing. The consequence of ADR 0059 that a rectangle leaving a container takes the whole container no longer holds.

A row moves into another card by a drag. A list with no copies has no element on the page, so nothing can be dragged into an empty list. A list the structure cannot count (`lists: null`) gives its items no path: they are picked by `item` alone and do not drag as items.

An id with several copies and no chosen copy has no handles and no label, until one copy is picked.

To take an element out of its container the pointer goes more than 32 px past the container's edge. A neighbouring container nearer than that takes the drop only from where the pointer is 32 px away from the element's own parent.

The studio has to read `gesture-log` and to pass on the releases it hears over a card. The frame sends it whether or not anything reads it, and nothing in the frame depends on an answer.

The rules (chosen copies, what a rectangle takes, the lists of an id, a slot in a list, where a held drag looks for its slot, the small element's handles, the scroll speed, the log) are pure functions with tests. The pointer wiring, the overlays and the scroll are checked live.
