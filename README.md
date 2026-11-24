# kitvas

kitvas is a Claude Code plugin. You describe a screen, Claude builds a prototype of it from your design system (React today, more to come), and kitvas builds it, checks it and shows it in a local studio, in versions.

Status: early (0.1.0).

## What you can ask for

- `/kitvas:compose`: a screen or page from a description, built section by section and fixed until its checks pass. Feedback gives a new version.
- `/kitvas:rework`: give a page you already have (a URL, a screenshot or a Figma link) and get a better version of it in your kit. The content and purpose stay the same; the layout may change. You confirm a short list of things that must stay (the logo, the main action, prices, fields), and every version is checked against it. The report says how many of the original's problems are gone.
- `/kitvas:craft`: name a component, icon or logo you are missing and show an example you like. You get three sketches in your kit's style to pick from. The one you pick goes into your project's kit, or into a folder you name.
- `/kitvas:learn`: teach kitvas your design system (below).
- `/kitvas:kit`: ask what your kit offers: components, tokens, icons.

## Your design system comes first

kitvas builds from the design system your project already has. The rework and craft skills look for it first (`kitvas kit detect`). If your project has a design system that kitvas has not learned yet, they offer to learn it before anything else, instead of quietly using the built-in kit.

kitvas can learn:

- an npm package (public or private), or a folder of your own components, with Tailwind v4 supported;
- a Figma file, read through your own Figma MCP;
- a website, or screenshots.

To set one up:

1. If it is a package, install it in your project yourself. kitvas never installs a design system.
2. Run `/kitvas:learn`. The kit lives in `.kitvas/kits/<id>/`; commit it to share it with your team.
3. `kitvas kit verify <id>` checks the kit against your real packages: imports, types, every example rendered in the browser, and the tokens. `/kitvas:learn` fixes what it reports.
4. `kitvas kit use <id>` makes it the project's kit.

What craft adds goes to `.kitvas/additions/<kit-id>/`, next to the kit, never into the kit's package.

## Checks

`kitvas check <draft>` builds a draft and checks it: the build, types, the kit's rules, and the page in a browser at 390 and 1280 px, in every state. The browser checks cover accessibility, the look (`ui`), the flow (`ux`) and errors at runtime. Every finding has a place, a message and a hint. `kitvas guidelines` lists the rules, each with the guidance it is based on.

## The studio

`kitvas studio --open` opens the project's studio in your browser. It shows:

- a gallery of drafts;
- each draft at every width, in every state and version, with its findings marked on the page;
- two versions side by side; a rework also next to its original;
- a craft draft's sketches, with the command that picks one;
- your kit: tokens, components and their examples.

Notes you leave in the studio reach Claude. The studio keeps its address (`http://kitvas.localhost:<port>/`), and your browser stays signed in for 30 days, so a bookmark works after a restart.

### Look

The View button in the bar of every page sets how the studio looks: the theme (system, light or dark), the panels (Cards, as islands, or Flush, with hairlines) and the accent (Copper, Teal, Coral or Rose). The choice is yours, not the project's: it is kept in `~/.kitvas/config.json`, holds in every project and after a restart, and applies at once without reloading a prototype. The studio has its own colours and typeface (Figtree, served by the studio itself); your kit and your drafts are never touched by them.

## Edit in the studio

A draft opens as one screen that never scrolls: a bar on top, layers and the insert palette on the left, the prototype in the middle, and properties, changes, checks (and sketches, for a craft draft) on the right. The bar switches Preview and Edit, picks a version or one to compare, and holds undo, redo and "Save version". For 8 seconds after a save, "Undo save" brings the session back.

Drag the edge of a panel to resize it (arrow keys step 16 px, a double click resets it). `[` and `]` fold the left and right panel, `Ctrl+\` folds both, and the sizes are kept. Zoom runs from 10 % to 400 % with Ctrl and the wheel (also over the prototype), the buttons or a typed percent. `Shift+1` fits the prototype to the room, and it stays fitted when panels move; `Shift+2` zooms to the selection and `Ctrl+0` goes to 100 %. Hold Space and drag, or drag with the middle button, to pan. The width has the presets 390, 768 and 1280, where the checks' marks show, and any width from 320 to 2560 px. Press `?` for every shortcut, searchable.

Switch to Edit in the bar. Click an element (Shift adds more, Esc clears, the arrow keys go to the parent or the first child), or find it in the layers list. Then you can change:

- a kit component's props: variant, size, gap and the rest;
- spacing, colour, typography, radius, border, width and height, with the kit's tokens offered first and the arrow keys stepping through the kit's scale;
- the text, by a double click.

Each row says where its value lives: a kit prop, the section's SCSS, or the kit's default. kitvas writes the change into the draft's TSX or SCSS itself, touching only the lines it changes, and the prototype shows it within about a second. A value outside the kit is allowed; it is marked in the code and in the session's change list, and can be mapped to the nearest token. Undo and redo work with Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y.

You can also change the structure. Drag an element on the prototype or in the layers list; a line shows where it will land, and Esc cancels. Drag a rectangle over empty space to select several elements. The palette inserts a kit component, an icon or a section of another draft that uses the same kit. The right-click menu and the keys offer delete, duplicate, copy, cut, paste, copy and paste style, move up and down, wrap in a stack, a grid or a card, unwrap, replace with another component, reset to how it was when the session started, select similar, hide, lock, and copy code location (the file, line and column, ready to paste). A locked element is picked in the layers list only: a click on it in the prototype selects what is under it. Each menu item shows its key. Sections can be reordered, deleted and inserted. Handles on the selected element resize it and change its padding and gap, snapping to the kit's scale (Shift writes a raw value, marked off-kit). Zooming never changes the prototype's real width. Every step is one undo.

A page lives at several widths and in several states, and the editor sees both:

- The Widths control in the dock shows one, two or all three preset widths side by side (390, 768, 1280). The card you last clicked in sets the width of an edit: at 390 it applies to all widths, at 768 or 1280 from that width up, written as a `@media (min-width: …)` block in the section's SCSS, or as an `md:` or `xl:` utility in a Tailwind draft. The kit may name its own breakpoints in `kit.json`.
- The state bar (Default, Hover, Focus, Active) forces that state on the selected element in every card and sends your edits to it, written as `&:hover`, `&:focus-visible` or `&:active`, or as a `hover:` utility. A forced state is only a preview: it never reaches the build, and it ends with Edit or with the selection.
- Each style row says where its value comes from (set here, from all widths, from 768 up, or the kit) and offers "Remove for this width" and "Apply to all widths".
- After each edit's build the editor measures the changed elements in every card (text contrast, target size, content that overflows or is cut) and checks the code it wrote (values outside the kit, plain controls). A finding shows in the Checks tab, as a mark on the canvas and at the top of Properties. A colour or size option that would fail warns you before you pick it. The Properties panel also has an accessibility card: role, name, focus order, contrast and target size of the selected element.
- Save version starts the full check in the background and shows its result when it ends. A finding you accept on purpose ("Accept…", with a reason) is kept in `waivers.json`, shown as accepted, left out of what must be fixed and out of `kitvas check`'s count, and carries to later versions while its element exists.
- An element made by a `.map` over a literal array in the same file can be moved, duplicated, deleted and have its text edited; each step changes only that item's text.
- An image file (PNG, JPEG, WebP, AVIF or GIF, up to 5 MB; never SVG) can be uploaded from the background image picker, dropped on an element in the prototype, or dropped on the Insert tab. It goes into the version's `src/img/`; dropped on an `img` it sets `src`, dropped on any other element it sets the background image, with undo.

Some things are refused with "Ask Claude": an element inside a list that is not a literal array in the same file (a prop, an import or a computed one) or inside a condition (`&&`), a copy that uses variables of its old place when it goes to another section, a style that a kit prop covers at another width or state, and the sections of a craft draft's sketches.

The first edit starts a new version, and later edits go into it. "Save version" ends the session; the next edit starts another version. Claude can edit the same files while you work: you see its changes live, and when you both changed the same place you choose between yours and theirs.

The editor also works with Claude, with notes, with locks and with time:

- **Ask Claude to change things.** The AI tab takes a sentence about the selected elements, or "Improve", and Claude answers one to three variants. Each previews on hover with its checks (contrast, target size, overflow, changed text); a click applies it as one undo step. **This needs a Claude Code session that is listening:** run `/kitvas:edit <draft>` in Claude Code and leave it running. Without one, requests wait on disk and are answered when a session starts. Your text is data for Claude, never an instruction to its tools.
- **Notes** (right click, "Note…") pin to an element, for you or for Claude, and follow it to later versions.
- **Locks** hold against Claude too: the editor refuses to change a locked element, Claude is told never to, and if a file changes one anyway kitvas shows it (also in `kitvas check`) and offers Restore. Lock and hide survive a reload. Nothing is reverted behind your back.
- **The timeline** under the canvas shows any version read only, marks where the selected element changed, and brings one element back as a diff. An identifier the current file lacks refuses it with the name; a kit import it needs is added.
- **Suggestions.** A plain `<button>`, input, heading or card-like `div` that a kit component covers shows "This looks like <Component> from the kit" with Replace.
- **Why.** The Why tab lists, per section, the reasons Claude wrote when it made it, and says when the section changed since. An older section offers "Ask Claude for the reasons".

What works offline: the studio, every edit above, the builds, the checks and the versions. No account, network or model is involved. What needs Claude: the AI tab and the reasons (a listening Claude Code session, as above), and asking for a change kitvas cannot write itself, such as a value computed in code, a prop passed through a spread or a style set by a utility class. kitvas refuses those and shows why. "Ask Claude" then sends the element, the change you wanted and the reason to Claude through the studio's notes. Drafts that use Tailwind can edit props, text and styles; a style is written as a utility class of the element's own `className` string. Text that spans several lines in the code is read-only too, and a rebuild while you type in the prototype reloads it, so finish the text first.

## What kitvas will not do

- Write into your application's code. Everything goes to `.kitvas/`, or to a folder you name when you export.
- Open a local or private address you give it, unless you allow it with `--allow-private`.
- Copy an example. A page, screenshot or logo you show gives the idea and the style, never a traced copy.

## Requirements

Node 24.22.3 or later in the 24 line, or 26.13.1 or later.

## What it installs

On the first session after an install or update, kitvas runs `npm ci --ignore-scripts` for its own dependencies in the plugin's data folder. This needs access to the npm registry.

## Develop

```bash
npm ci --ignore-scripts
npm run check
```

See `AGENTS.md` for the rules and `docs/adr/` for the decisions.

## License

[PolyForm Shield 1.0.0](LICENSE.md). You may use, change and share kitvas for any purpose, at work too, except to sell it or to build a product that competes with it.
