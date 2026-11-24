# 0053. Canvas tools

Date: 2026-11-23. Status: accepted. Spec: `docs/specs/2026-11-23-kitvas-stage-4b-editor-structure-design.md`, decisions 11, 12, 13 and 14. Builds on ADR 0050.

## Context

Dragging, resizing and zooming must feel direct, yet the prototype stays a real page at its real width and the checks see the same page at any zoom. Only the frame knows the real layout. Only the page knows the draft's files and the kit.

## Decision

- **Drag lives in the frame.** The frame reads the real layout of the parent (computed `display`, `flex-direction`, grid flow, the children's boxes) and picks a drop slot: before or after a child along the axis, or first or last inside an accepting parent. The decision is a pure function over plain data. The indicator is a line or an outline in an overlay that is not part of the page. On drop the frame moves the DOM node at once as a preview, posts `drop {source, anchor, place}`, and the page sends the operation.
- **Slots follow the structure rules.** No slot inside the dragged element, between the children of mixed text, inside a non-accepting element (a void tag, a component without `children`), beside an element that cannot move, or for an interactive source inside an interactive target. Esc cancels.
- **Drags from the palette and the tree** are forwarded by the page into the frame through the existing channel, in frame pixels. An inserted component cannot render before the build, so the frame shows a placeholder box with its name until the frame reloads.
- **A rectangle** drawn from empty space selects the outermost elements whose boxes lie fully inside it. A drag of more than 4 px that starts on a selected element moves it.
- **Handles write through the style source.** The frame draws handles for width, height, padding and gap on the selected element and previews the value inline in the frame only. It snaps to the kit's size and space steps, sent to it by the page as tokens; Shift releases the snap and writes a raw value marked off-kit. On release the page writes by the rule of ADR 0050: a kit prop (a `Stack`'s `gap`), else the class rule in the section SCSS, with `addClass` first when needed. A Tailwind draft writes nothing and says so. No handle ever writes `position`, an offset or a transform.
- **Guides** show the distance between the selected element and the one under the pointer, in pixels and as the nearest space step, during a handle or move drag and on Alt.
- **Zoom and pan live on the page.** The frame box is scaled with a CSS transform (25 % to 200 %) and the stage scrolls. The frame keeps its width, its pixels and its events, and the browser maps the pointer through the transform. The page converts forwarded points to frame pixels by the zoom. The checks see the same page at every zoom.
- **Hide is a view filter.** The page sends the hidden ids; the frame adds `display: none` for them in a style element of its own. It is never written to the draft and lasts for the page's session.

## Consequences

The preview, the slots and the handles use the layout the person sees, so they stay right when the layout changes mid-drag. The cost is more code in the frame, kept in small files by responsibility, and a protocol of messages between the page and the frame. Zoom is a view change only, so nothing in the draft depends on it.
