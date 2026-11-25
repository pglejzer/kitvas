# 0077. Tools on the canvas: lens pins in the frame, page tools over the stage, one control for Claude

Date: 2026-11-25. Status: accepted. Builds on ADRs 0053 (canvas tools), 0056 (the editor with Claude), 0057 (the frame's tones) and 0066 (what a drag draws). Spec: `docs/specs/2026-11-24-kitvas-studio-redesign-design.md`, Part 2, goals 9 to 12. Plan 19.

## Context

Mock v10 draws four tools on the canvas: a lens pill whose pins say something about the elements (Design, Kit, Checks, Why, Changes), an ask bar under the canvas, a pill that flips Claude's variants, and an action bar on the selection. Until now the numbered dots of the checks and the live tags were the only things on a draft, drawn by frame overlays that never took the pointer, and the Claude tab held the only form that sent a request. The owner asked for a canvas that is not covered.

## Decision

- **Lens pins are drawn in the frame and take the pointer.** One new overlay (`client/frame/lens/`), a closed shadow root at the end of `body` like the note pins, with the studio's pop tones by name. Unlike every earlier overlay a pin has `pointer-events: auto`: listeners on the window, in the capture phase, stop each pointer event aimed at the overlay before the pick, the drag, the rectangle or a link hears it, and a click reports `{ type: 'pin', key }`. The pins are placed above an element's top-left corner, stack downward, never leave the page's width, and are placed again once per frame on scroll, resize, size change and a build taken in place. A drag hushes them as it hushes every other mark (ADR 0066).
- **The page decides the pins; the frame only draws them.** Pure modules build each lens's pins from what the page already has (findings, the live results, the session's changes, the Why report, the Kit lens's report), at most 200 per frame, and the page sends them to the current card and the width cards. A pin's words go in with `textContent`. In the Checks lens a pin takes the place of the numbered dot and the live tag; outside it no check mark is drawn and the pill carries the count.
- **The Kit lens reads one new read-only route**, `GET /api/v1/drafts/{slug}/kit-lens`: per element the container's spacing token, an off-kit value with the nearest token, and the component that could stand in, for at most 400 elements. It shows no name tag on every kit component.
- **The ask bar, the action bar and the variant pill are page markup over the stage**, never in the frame. The action bar follows the selection's box through `locate` with `scroll: false` and the copy's `item`, so reading a box never scrolls the page and a list item's bar sits on that item. It leaves during a drag, a handle, a resize, a text edit, a pan and a zoom, and comes back 150 ms after.
- **The Claude tab hands its actions over through one typed control** (`client/studio/edit/ai/control.ts`): send a sentence, Improve, the variants of the newest answered request for an element, show one, apply one, and hear changes. The tab fills it when it mounts; a tool that finds none is off and says why. The tab keeps the requests, the previews and the writes; its own form is gone and the person types in the ask bar.
- **"Custom…" in Properties keeps its editor open in one memory of the pane**, not in the control that a redraw throws away. A colour opens a picker drawn on canvases (square, hue, alpha, an eyedropper where the browser has one) that previews while it is dragged and writes once on release; any other value opens a number field with its unit.

## Turned down

- **Pins drawn by the page over the frame.** The page would have to follow every scroll, zoom and layout change of the frame from outside, a frame late after each one. Only the frame knows where its elements are.
- **A name tag on every kit component in the Kit lens.** A real page has 40 or more; the Layers list already names them, and the canvas would be covered.
- **Dots and tags kept beside the pins.** Two marks for one finding; the Checks lens pin replaces both.
- **A second copy of the request logic, or an event bus, for the tools.** Two senders drift apart; an event bus hides who answers. One typed control keeps the tab the only owner of requests.
- **The action bar inside the frame.** It would cover the draft's own pixels at the draft's zoom, take the draft's focus order and need a second set of tones; over the stage it keeps the studio's size at every zoom.
- **Gradients in the skin for the colour picker.** A skin holds no colour of its own (ADR 0057); the square and the tracks are drawn on canvases from the value being edited.

## Consequences

The frame now has one overlay that takes the pointer. Its listeners must stay first on the window, before the edit layer, the structure and the canvas; a test holds that a press on a pin picks nothing. The page no longer sends the findings' numbered dots or `live-marks`; the frame can still draw both and nothing sends them. Lens changes send messages only: no frame reloads and nothing in the draft changes. The tools without a listening Claude Code session show why they are off and keep what the person typed.
