# 0087. The Base kit's Select draws its list in the page

Date: 2026-11-26. Status: accepted. The canvas keeps the transform of `0053-canvas-tools.md`.

## Context

The canvas scales its cards with a CSS transform. A browser draws the list of a native `select` as a window of the system: it leaves the transform out, so at any zoom but 100 % the list opened beside its control and at its full size. No check could see it, because a system window is in no screenshot and in no page fact. The person found it in the first minute of using a draft.

## Decision

- **The list is part of the page.** In `kits/base/scss/input/_field.scss` the Select's control and its `::picker(select)` take `appearance: base-select`, inside `@supports (appearance: base-select)`. The browser then lays the list out in the page: it is anchored to its control, scaled with the card and captured by a screenshot. The element stays a native `select`, with its own keys, focus and role.
- **The look is the kit's.** The list, its options, the chosen option's mark and the chevron are drawn from the kit's tokens; the chevron is two borders, since the kit has no icon font.
- **Elsewhere nothing changes.** A browser without `base-select` skips the block and opens the system's own list.
- **Space with the right button pans too.** While the shield is up it takes the right button's press as it takes the left one's, and keeps the browser's menu away.

## Turned down

- **Scaling the canvas with the browser's `zoom` in Preview.** The list opens in place, but the page in a frame is laid out again at every step of the zoom: its width moves between 389 and 392 px for a 390 px card and its height by up to 10 px, so the page jumps while it is zoomed, and the wheel's step grows as the zoom falls. Built, measured and taken out.
- **A list written by hand (a button and a popover).** It would need its own keys, focus, type-ahead and screen reader roles, which the native element already has, and it would no longer be the phone's own picker where a browser has no `base-select`.
- **Leaving it.** A person cannot use a select at the zoom the studio opens a draft at.

## Consequences

A kit written from a Figma file, a website or images gets the same list by rule W15b of `reference/write-kit.md`. The list of a native `select` in a kit that exists already or was learned from a project's own components, and the pickers of a date, time or colour field, are still windows of the system and open beside their control at any zoom but 100 %. In a browser without `base-select` the Base kit's list does so as well.
