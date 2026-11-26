# The studio editor

The full guide to editing a draft in the kitvas studio. For what kitvas is and how to install it, see the [README](../README.md).

## The studio

`kitvas studio --open` opens the project's studio. It shows a gallery of drafts; each draft at every width, state and version, with findings marked on the page; two versions side by side (a rework also next to its original); a craft draft's sketches; and your kit's tokens, components and examples.

A draft is deleted from its card in the gallery or from the editor's menu. It moves to Deleted (the folder `.kitvas/trash/`), where it can be restored or removed for good.

Switch a draft to Edit to change it by hand:

- a kit component's props, and spacing, colour, typography, radius, border and size, with the kit's tokens offered first;
- text, by a double click;
- structure: drag, insert, delete, wrap and reorder elements and sections;
- widths and states: an edit at 768 or 1280 px is written as a media query, a hover or focus edit as `&:hover` or `&:focus-visible`;
- live findings after each edit, with Apply for a target that is too small and for text of too low contrast.

Everything above works with no network, no account and no model: the studio, the edits, the builds, the checks and the versions. Asking Claude (the ask bar under the canvas: variants for a sentence or "Improve"), requests for changes kitvas cannot write itself, and the reasons behind a section need a listening session: run `/kitvas:edit <draft>` in Claude Code and leave it running.

## The screen

A draft opens as one screen that never scrolls: a bar on top, layers and the insert palette on the left, the prototype in the middle, and properties, changes, checks (and sketches, for a craft draft) on the right. The bar switches Preview and Edit, picks a version or one to compare, and holds undo, redo and "Save version". For 8 seconds after a save, "Undo save" brings the session back.

Switch to Edit in the bar to change the draft.

## Zoom, pan and panels

- Drag the edge of a panel to resize it. The arrow keys step 16 px and a double click resets it.
- Zoom runs from 10 % to 400 % with Ctrl and the wheel (also over the prototype), the buttons or a typed percent.
- Hold Space and drag, or drag with the middle button, to pan.
- The width has the presets 390, 768 and 1280, where the checks' marks show, and any width from 320 to 2560 px. Zooming never changes the prototype's real width.
- Press `?` for every shortcut, searchable.

| Key | Action |
| --- | --- |
| `[` and `]` | Fold the left and right panel |
| `Ctrl+\` | Fold both panels |
| `Shift+1` | Fit the prototype to the room; it stays fitted when panels move |
| `Shift+2` | Zoom to the selection |
| `Ctrl+0` | Zoom to 100 % |
| `Space` and drag | Pan |
| `Esc` | Clear the selection, or cancel a drag |
| Arrow keys | Select the parent or the first child |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| `Ctrl+Enter` (`Cmd+Enter`) | Save a note |
| `Ctrl+K` (`Cmd+K`) | Put the cursor in the ask bar |
| `←` and `→` | Flip Claude's variants while the variant pill shows |

The sizes of the panels are kept.

## Selecting

- Click an element, or find it in the layers list. A click on empty page, or on the canvas beside the cards, clears the selection.
- Shift, Ctrl or Cmd with a click adds an element to the selection, on the page and in Layers.
- Press and drag on the page to move an element (see Structure). Drag a rectangle over empty space to select several elements. It takes the elements it touches that do not hold it whole, the outermost of those, never a locked element. A rectangle with Shift, Ctrl or Cmd held adds to the selection. A rectangle that takes nothing clears it.
- A locked element is picked in the layers list only: a click on it in the prototype selects what is under it.

## On the canvas

- **Lenses.** The pill over the canvas switches what the pins on the prototype say. Design shows none. Kit shows a container's spacing token, the values off the kit (one pin an element, only where the kit has a scale for them, never on a visually hidden helper) with the nearest token, and the kit component a plain element could be. Checks shows one pin per finding, with the count on the pill. Why shows the first reason of each section. Changes shows who changed each element in this session. Kit and Changes need Edit. A click on a pin selects its element and opens the pane it is about. A lens never reloads the prototype; the canvas shows 200 pins at most.
- **The action bar** sits above the selection: Ask Claude, the element's quick actions and More. It leaves while you drag, resize, pan or zoom, and comes back when you stop. The arrow keys move between its buttons.
- **The ask bar** under the canvas takes a sentence about the selection and sends it to Claude. Type `/` for the commands (Improve first, then Duplicate and the rest); an action that is off says why. Without a listening session it says so and keeps your words.
- **The variant pill** shows when the selected element has Claude's answer: `←` and `→` flip the variants on the canvas, Apply writes the one shown as one undo step, and Discard closes the pill.

## What you can change

- A kit component's props: variant, size, gap and the rest.
- Spacing, colour, typography, radius, border, width and height, with the kit's tokens offered first and the arrow keys stepping through the kit's scale.
- A value of your own: "Custom…" at the foot of a token list. A colour opens a picker (square, hue, opacity, an eyedropper where the browser has one, a typed value) that shows on the canvas while you drag and writes once when you let go. Any other value opens a number field with its unit. The editor names the nearest token, with "Use <token>". Escape closes it and writes nothing.
- The text, by a double click.

Each row says where its value lives: a kit prop, the section's SCSS, or the kit's default. kitvas writes the change into the draft's TSX or SCSS itself, touching only the lines it changes. The studio takes each finished build into the prototype in place, with no reload: the page keeps its scroll and the editor's overlays, and the change shows within about a second. A value outside the kit is allowed. It is marked in the code and in the session's change list, and it can be mapped to the nearest token.

Drafts that use Tailwind can edit props, text and styles. A style is written as a utility class of the element's own `className` string.

### Text

A double click edits an element's text in place. It works for a plain text, for a text held in a field of a list item, in a nested list, and for a text chosen by a condition (`?:`, `||`, `??`, `&&`), when the editor can find the one string literal in the same file that renders it. A double click with Shift, Ctrl or Cmd held starts no text edit. A text that comes from a prop, an import or a call is refused, and the refusal says why and offers Ask Claude. Text that spans several lines in the code is read-only.

## Structure

- Press and drag moves an element at once. The element is the one under the pointer if it is selected, else the nearest one that can move. A line shows where it will land, and Esc cancels. The page's selection follows it.
- The layers list takes drags too.
- Items of a list made from data (a `.map` over a literal array in the same file) can be dragged to reorder. The line shows the place, and the item is dimmed while it moves. Items can also be moved, duplicated and deleted, and have their text edited; each step changes only that item's text.
- The palette inserts a kit component, an icon or a section of another draft that uses the same kit.
- The right-click menu and the keys offer delete, duplicate, copy, cut, paste, copy and paste style, move up and down, wrap in a stack, a grid or a card, unwrap, replace with another component, reset to how it was when the session started, select similar, hide, lock, and copy code location (the file, line and column, ready to paste). Each menu item shows its key.
- Sections can be reordered, deleted and inserted.
- Handles on the selected element resize it and change its padding and gap. They keep their size on the screen at any zoom, and they follow the pointer pixel by pixel. They snap to a step of the kit's scale only when the pointer is within 6 px of it. Shift switches the snap off and writes a raw value, marked off the kit. A property that a kit prop covers takes steps only. A handle that cannot write is not drawn.
- Every step is one undo.

## Widths and states

A page lives at several widths and in several states, and the editor sees both:

- The Widths control in the dock shows one, two or all three preset widths side by side (390, 768, 1280). The card you last clicked in sets the width of an edit: at 390 it applies to all widths, at 768 or 1280 from that width up. It is written as a `@media (min-width: …)` block in the section's SCSS, or as an `md:` or `xl:` utility in a Tailwind draft. The kit may name its own breakpoints in `kit.json`.
- The state bar (Default, Hover, Focus, Active) forces that state on the selected element in every card and sends your edits to it. They are written as `&:hover`, `&:focus-visible` or `&:active`, or as a `hover:` utility. A forced state is only a preview: it never reaches the build, and it ends with Edit or with the selection.
- Each style row says where its value comes from (set here, from all widths, from 768 up, or the kit) and offers "Remove for this width" and "Apply to all widths".

## Options

A version can hold choices, such as a light and a dark theme, two or three columns, or an outlined or a filled card (`src/json/options.json`; Claude writes it when you ask for them). A version without options has no Options pill and no row.

- The Options pill stands in the pill row before the width pill. It shows how many options the version has and a dot while the values shown are not the defaults; it opens and folds the row under the pills (one line, as wide as the canvas). The row stays as you left it in this browser. Opening it moves the page down by the row's height, as a panel fold does; nothing else moves.
- Each option is its name and its values. Press a value and every card of the page switches in place: the frames never reload, so your selection, your locks and your notes stay. The label above each card names the values that differ, and the address keeps them (`opt-columns=2`), so a reload, a link and the other pills keep the choice. Every value is also a plain link, so the row works without the script. Values that do not fit scroll sideways; the end of the row stays in view.
- At the end of the row: "Default" while every value is the default; otherwise "Reset", which shows the defaults and writes nothing, and, in Edit on the latest version, "Make default", which writes the values shown as the defaults of the version. Make default is an edit: one step of Undo and Redo, and the first edit of a session starts a version.
- A style edit goes where the value comes from. Under the width and the states Properties has a third control: "All options", or "Only <Option>: <Value>" for each value shown that is not its option's default. On "All options" a value that an option's block sets is changed in that block, and every other value in the rule itself, for every option. On "Only Cards: Filled" the edit is written for that value alone, as `[data-opt-cards="filled"] & { … }` in the section's SCSS. A row whose value comes from such a block says so ("Only Cards: Filled") and offers "Remove for this option" and "Apply to all options". A prop has one value for every option, and a Tailwind draft has no such control.
- Options are not part of Compare: while two versions are compared the pill and the row are not shown.
- When the canvas is narrow the pill keeps its icon, its count and its dot, and loses its word first (the fit of the canvas's bars).

## Live checks

After each edit's build the editor measures the changed elements in every card (text contrast, target size, content that overflows or is cut) and checks the code it wrote (values outside the kit, plain controls). A finding shows in the Checks tab, as a mark on the canvas and in the line above Properties. That line is there for as long as an element is selected and keeps one height, so a finding that comes or goes never moves the pane under your pointer; press it to open the findings as cards, and it stays as you left it. A colour or size option that would fail warns you before you pick it. The Properties panel also has an accessibility card: role, name, focus order, contrast and target size of the selected element.

- A target that is too small and text of too low contrast can be fixed with Apply. The card says what Apply will set before you click. Apply is one undo step. A colour written by hand offers "Use <token>", the kit colour nearest to it. Any other finding offers Ask Claude.
- A finding you dismiss (the eye icon on its card, then a quick reason or your own) is kept in `waivers.json`, shown as dismissed with Restore, left out of what must be fixed and out of `kitvas check`'s count, and carries to later versions while its element exists.
- Save version starts the full check in the background and shows its result when it ends.

## Images

An image file (PNG, JPEG, WebP, AVIF or GIF, up to 5 MB; never SVG) can be uploaded from the background image picker, dropped on an element in the prototype, or dropped on the Insert tab. It goes into the version's `src/img/`. Dropped on an `img` it sets `src`; dropped on any other element it sets the background image. Either is one undo step.

## Versions and saving

The first edit starts a new version, and later edits go into it. "Save version" ends the session; the next edit starts another version. Claude can edit the same files while you work: you see its changes live, and when you both changed the same place you choose between yours and theirs.

Undo and redo work with Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y. The change list holds what differs from the last saved version: an undone step leaves it and a redo puts it back, so the counts in the bar, on the Changes tab and on the Changes lens say how many changes are in effect. The undo history and the change list are kept in the browser per draft, so a reload of the page does not empty them. Save version ends the session and clears them; Undo save brings them back. A change that cannot be saved leaves the history as it was and the bar says so: "The change could not be saved. Try again."

## With Claude

The editor works with Claude, with notes, with locks and with time.

- **Ask Claude to change things.** The ask bar under the canvas takes a sentence about the selected elements, or "Improve" (`/`), and Claude answers one to three variants. They show in the variant pill on the canvas and in the Claude tab, where each previews on hover with its checks (contrast, target size, overflow, changed text); Apply or a click applies one as one undo step. **This needs a Claude Code session that is listening:** run `/kitvas:edit <draft>` in Claude Code and leave it running. Without one, requests wait on disk and are answered when a session starts. Your text is data for Claude, never an instruction to its tools.
- **Notes** (right click, "Note…") pin to an element, for you or for Claude, and follow it to later versions. A note is typed in a multi-line field: Enter starts a new line, and Ctrl or Cmd with Enter saves it.
- **Locks** hold against Claude too: the editor refuses to change a locked element, Claude is told never to, and if a file changes one anyway kitvas shows it (also in `kitvas check`) and offers Restore. Lock and hide survive a reload. Nothing is reverted behind your back.
- **The timeline** under the canvas shows any version read only, marks where the selected element changed, and brings one element back as a diff. An identifier the current file lacks refuses it with the name; a kit import it needs is added.
- **Suggestions.** A plain `<button>`, input, heading or card-like `div` that a kit component covers shows "This looks like <Component> from the kit" with Replace.
- **Why.** The Why tab lists, per section, the reasons Claude wrote when it made it, and says when the section changed since. An older section offers "Ask Claude for the reasons".

What works offline: the studio, every edit above, the builds, the checks and the versions. No account, network or model is involved. What needs Claude: the ask bar, the variants and the reasons (a listening Claude Code session), and asking for a change kitvas cannot write itself.

## What is refused

Some things are refused with "Ask Claude". The refusal shows why, and Ask Claude sends the element, the change you wanted and the reason to Claude through the studio's notes:

- an element inside a list that is not a literal array in the same file (a prop, an import or a computed one), or inside a condition (`&&`), when the change is not a text that the editor can trace to one literal;
- a text that comes from a value computed in code, a prop or a call;
- a prop passed through a spread, or a style set by a utility class;
- a copy that uses variables of its old place when it goes to another section;
- a style that a kit prop covers at another width or state;
- the sections of a craft draft's sketches.

## The studio's look

The View button in the bar of every page sets how the studio looks: the theme (system, light or dark), the panels (Cards, as islands, or Flush, with hairlines) and the accent (Copper, Teal, Coral or Rose). The choice is yours, not the project's: it is kept in `~/.kitvas/config.json`, holds in every project and after a restart, and applies at once without reloading a prototype. The studio has its own colours and typeface (Figtree, served by the studio itself); your kit and your drafts are never touched by them.
