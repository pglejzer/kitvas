# 0059. Pointer gestures in the frame

Date: 2026-11-24. Status: accepted. Changes three parts of ADR 0053: the rectangle, which press starts a drag, and the snap of the handles. Builds on ADRs 0053 (canvas tools), 0055 (data lists) and 0058 (a build taken in place). Plan 18b, agent B.

## Context

The owner, after a live test: elements cannot be dragged, selecting with the mouse works badly and leaves a rectangle on the page, and pulling an element taller or wider does not work well. Each has a cause in the rules of ADR 0053.

- Only a press inside an already selected element dragged. Any other press drew a rectangle, so pressing an element and pulling it moved nothing.
- Most of what a draft shows is rendered by a `.map`. Such an element cannot move as an element, and the data op that reorders the items (ADR 0055) had no gesture.
- The frame posted `rect` and no module of the studio heard it. The rectangle took only elements that lay fully inside it, and a release the frame did not hear left it drawn.
- The handles were sized in frame pixels, so on a canvas at 68 % they were 4 px on the screen and a press missed them. A handle always jumped to the nearest step of the scale, however far: on a sparse size scale a box pulled 40 px taller became 40 px high. A handle whose write would be refused was still drawn.

Only the frame knows the layout and holds the pointer. Only the page knows the source. The canvas zoom is a CSS transform on the frame, so one frame pixel is not one pixel on the screen.

## Decision

- **Sizes are pixels on the screen.** The runtime gives the structure the inverse of the canvas zoom (`scale`: frame pixels per screen pixel). The drag threshold, the indicator line, the rectangle's border and outlines, the handles, their label and the guides multiply their sizes by it, set inline on their own overlay nodes. Nothing of the page is scaled.
- **A press drags at once.** A press that moves more than 4 px on the screen becomes a gesture, chosen from the pressed element outwards: with Shift, Ctrl or Cmd held, a rectangle that adds to the selection; else a selected element around the point moves (with the selected run of neighbouring siblings), or reorders when it is a list item; else the nearest element that can move is dragged, or the nearest list item, whichever comes first; with none up to the section's root, a rectangle. A drag of an element that was not selected posts its `pick` first, so the panels follow it. A press that stays within the threshold is still a click, picked by `edit.ts`.
- **A list item reorders the data.** The structure says which element is a list item (`item`): the one a `.map` over a literal array of the file returns, not the elements deeper in the callback. Its copies share one id, and copy `n` in document order is item `n`. While one drags, the only places are before or after another copy inside their common parent; the line shows the place and the copy is dimmed. The drop posts `reorder {id, item, to}` and moves the copy at once as a preview; the page writes `moveItem` through the history and keeps that item picked. A drop on its own place writes nothing. When the write is not applied, the frame is loaded again.
- **The rectangle takes what it touches.** It takes the elements it overlaps that do not hold it whole, the outermost of those, each id once, in document order, never a locked element or one inside it. So a rectangle across two cards takes the two cards, and one drawn inside a card across its rows takes the rows. While it is drawn, each element it would take is outlined. The page hears `rect` in edit mode and sets the selection to the ids, or adds them when a modifier was held; a rectangle that took nothing clears the selection.
- **The rectangle always leaves.** It ends on the release of any pointer, on `pointercancel`, on the loss of the pointer capture the drag took, on window `blur`, on Escape, on a pointer move with no button down, and before any new press.
- **Handles keep their size on the screen.** A handle is a bar that is drawn (about 4 by 18 px on an edge, 8 px square on the corner) inside a larger zone that takes the pointer, at least 12 px across, with the resize cursor over all of it. Where zones meet, the corner wins. The geometry is pure (`spots.ts`).
- **A handle follows the pointer.** The value changes pixel by pixel. A step of the scale, and for a width `auto` and `100%`, takes the value over only while it is within 6 px on the screen of it (`magnet.ts`); Shift switches that off. The label says the step and its pixels while a step holds, else the pixels. A held step is written as its token; a free value is written as raw pixels, marked off the kit as a Shift value was. This replaces "it snaps to the kit's size and space steps" of ADR 0053.
- **A property a kit prop covers still takes steps only.** A `Stack`'s `gap` prop has no value between two steps, and a raw value would write nothing. The page names such properties (`stepped`), and their handles take the nearest step wherever the pointer is, with Shift held too.
- **A handle that cannot write is not drawn.** The `handles` message carries the properties the selected element cannot take (`blocked`): every one in a Tailwind draft and until the element's source view is read, else the ones the properties panel shows as read-only. The corner goes when either size is blocked. The note in the properties panel stays for a write the server refuses anyway.
- **A gesture holds the page.** A drag, a rectangle and a handle drag hold `busy` (ADR 0058) from their start to their end, so a build is never taken into the frame under them.
- **Still no position.** Nothing here writes `position`, an offset, a transform or an inline style into the draft. A handle's inline preview is taken back before its release is posted.

## Consequences

The natural gesture works: press, pull, drop. A click still selects, and the modifiers mean the same for a click, a Layers row and a rectangle.

A free value is off the kit. The off-kit mark and the checks say so, as they did for a Shift value; a person who wants a step lets the magnet take it. With a dense scale and a zoomed-out canvas, 6 px on the screen reach far in the element's pixels, so most values land on a step there.

A rectangle that starts in a container's padding and leaves the container takes the whole container. To select its children, the rectangle starts and ends inside it.

A list item drags only among copies that share one parent. A list rendered inside another list gives no place, and its items move with Move up and Move down as before. An element inside a list item still cannot move as an element.

The page must tell the frame the zoom, and every on-screen size in the frame's overlays is computed from it. The rules (the press, the session, the touch rule, the item places, the handle zones, the magnet) are pure functions with tests; the pointer wiring and the overlays are checked live.
