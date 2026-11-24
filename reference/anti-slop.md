# Rules against the generic look

Read by every agent that writes a draft, a component, an icon or a logo. "Slop" is the templated look that generated screens share: unchanged defaults and the average of the web. Your screen must look like the project's own kit. Each rule says what not to do and what to do instead. Reports cite the id.

Everything stays inside the kit: its components and `--kit-*` tokens. No rule here lets you invent a palette, a font or a brand look. If the brief asks for something the kit cannot express, say so in your report and use the nearest thing the kit has.

## A generated draft (screen, page, section)

- R-SLOP-1: Never open with a centred headline, a restating subline, one button and three identical icon cards. Build the sections the brief's content needs; give the most important item the most room; use the product's real name and task.
- R-SLOP-2: Never put a capsule badge ("New", "Beta") above a heading, or fill a heading with a gradient. Write the heading in the kit's text token. Put a status in the page's data.
- R-SLOP-3: Never invent proof: no made-up quotes, company logos, "trusted by 10,000 teams", user counts, uptime or ratings. Use only what the brief gives. If a slot needs a filler, use the kit's placeholder component and say so.
- R-SLOP-4: Never write lorem ipsum, "Item 1", or marketing filler ("Unlock the power of", "Supercharge", "Seamlessly", "Empower your team"). Write short realistic text with the brief's own nouns and numbers. A button says verb plus object: "Add section", not "Get started".
- R-SLOP-5: Align text left on the kit's layout grid. Centre only one short line inside a button or a badge. Never centre every section on one axis.
- R-SLOP-6: Never lay out evenly weighted rounded tiles, each with an icon, a bold word and one line (a bento grid, a row of feature cards). Use a list, a table or one column in the order of the person's task. Use a grid only for items that are truly equal.
- R-SLOP-7: Never show a row of big numbers with small captions that nobody acts on. Show a number only where the person acts on it, in body-sized text.
- R-SLOP-8: Never add a decorative blob, orb, mesh, particle, glossy 3D shape or glow behind content. Use the kit's plain background token. If a picture is needed, show the real product view or nothing.
- R-SLOP-9: Never use emoji as icons, bullets or labels. Use an icon from the kit's icon list, or plain text.
- R-SLOP-10: Never put an icon before every label. Use an icon only where the glyph is the standard one for a tool or a state; leave the rest as text.

## Colour and surfaces

- R-SLOP-11: Never use purple, indigo or violet as a primary look, and never a gradient on a fill, a border, a heading or a background. Use the kit's one accent token for the primary action and the selected item, and nothing else. Use flat surface and text tokens; make hierarchy with size, weight and the grey steps.
- R-SLOP-12: Never use more than one accent. A status colour (fix, review, good) only says a state, never decorates. Count the hues: one accent plus status colours is the limit.
- R-SLOP-13: Never add glow, a coloured shadow, `backdrop-filter` or a frosted panel. Use the kit's shadow token, in a neutral tone, only on what floats (a menu, a popover, a dialog). Flat panels get none.
- R-SLOP-14: Never put a coloured stripe on a card's edge, a coloured background behind each item's icon, or a tinted header band. Keep the surface neutral; use colour only where a state needs it.
- R-SLOP-15: Never nest a bordered card inside a bordered card. Keep one container level and group inside it with space, a divider token or a heading. A box gets one separation device: a fill step, a border token, or a shadow (floating only), never all three.
- R-SLOP-16: Never put a divider line between every row and section. Use space and a fill step first; use a hairline token where grouping is otherwise unclear.
- R-SLOP-17: Never use one huge radius on everything. Use the kit's radius tokens by role: control, container, overlay.
- R-SLOP-18: Never leave mid-grey text on a grey surface. Use the kit's text tokens that keep 4.5 to 1 on their surface, in the light and the dark theme alike. De-emphasise with size and position before colour.

## Type, spacing and motion

- R-SLOP-19: Use the font the kit declares and no other. Never pair a trendy display font, a serif italic accent word or a font chosen by habit.
- R-SLOP-20: Use at most four sizes and two weights in one section, from the kit's scale. Never use uppercase or letter-spaced labels; write sentence case. Keep headings at the kit's small and medium steps inside tools, dialogs and empty states.
- R-SLOP-21: Use the kit's spacing tokens only, the same gap for the same relation. Never mix gaps such as 10, 14 and 18 px.
- R-SLOP-22: Animate only what the person just changed or opened. No motion on hover, on a keyboard action or while idle; no bounce, no scale from zero. Use the kit's motion tokens, animate opacity and transform only, and wrap motion in `prefers-reduced-motion`.
- R-SLOP-23: Never switch a theme with a transition across the page, and never loop an animation as decoration.

## Copy and states

- R-SLOP-24: Write an error as problem, cause and next step: "We could not save version 4. The file is locked. Close it and try again." Never write "Something went wrong" or "Oops".
- R-SLOP-25: Write an empty state as one line that says what is missing and one action to add it. No illustration, no joke, no mascot.
- R-SLOP-26: Never use a toast for something that shows its result in place. Show the result where it happens; keep a failure visible until read.
- R-SLOP-27: Write one short sentence, or a label. Never join clauses with long lead-ins or use the three-part rhythm ("fast, simple, powerful").

## Icons and logos (the sketcher)

- R-SLOP-28: Never draw an icon or a logo as a gradient blob, a sparkle, a magic wand or a generic "AI" glyph. Draw it on the kit's grid, stroke, caps and radius, from a real metaphor for the subject.
- R-SLOP-29: Make the three sketches differ in idea (a shape, a metaphor, a structure), never in colour or stroke width alone. All three use the kit's own colours and stroke.
- R-SLOP-30: Never mix stroke and filled styles, or two stroke widths, in one set. Keep to the kit's.

## Claude's own mark

- R-SLOP-31: Never add a sparkle, an "AI" badge, an assistant avatar or an assistant name to a draft's UI. Name an action by what it does ("Propose variants", "Apply").

## Check before you report

- The competitor test: swap in another company's name. If the draft still works, it is generic: rewrite the copy and the structure with the brief's own content.
- Search your files for `gradient`, `blur`, `glow`, `lorem`, `uppercase`, `text-align: center`, `10,000`, "trusted by", emoji, and any hex colour or raw size: each hit is a failure.
- Count the hues, the sizes and the weights on one screen against rules 12 and 20.
- Open the draft in both themes of the kit when it has two: text must read in both.
- Name in your report any rule you could not meet with the kit, with its id.
