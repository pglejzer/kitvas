# Rules for controls

Read by every agent that writes or fixes a control (a button, a link, a toggle, a select, a field, a tab, a sortable column head), and by the skill that writes the brief and the layout. Rule ids are `R-CONTROL-n`. The sources, with the sentences quoted from them, are in `docs/research/control-states.md`.

A control is judged in use, not at rest: under the pointer, with keyboard focus, while pressed, and when it is on. Write it for those moments.

## States

- R-CONTROL-1: A control has these looks, and a person can tell them apart: rest, hover, keyboard focus, pressed, and where it has them, on (selected, pressed, current, checked) and disabled. A kit component brings them; keep them.
- R-CONTROL-2: Show "on" with the kit's own means first: a variant or a prop of the component. In the `base` kit the chosen button of a group is `variant="solid"` and the others are `outline`. Then its hover, focus and pressed looks come from the kit and fit each other.
- R-CONTROL-3: When the kit has no such variant and you style a state yourself, the kit's own state rules still apply to the element and may win over yours: the `base` kit's `.kit-button--outline:hover:not(:disabled)` beats `.filters button[aria-pressed='true']`. So write the state's look for `&:hover`, `&:focus-visible` and `&:active` too, inside the state's block.
- R-CONTROL-4: A background and the text colour on it change together. Every block that sets one sets the other, as a token pair meant to go together (R-COMPOSE-23). A block that sets only `background` leaves another rule's text colour on it.
- R-CONTROL-5: Text keeps 4.5 to 1 against what is behind it (3 to 1 for large text) in every state and every combination: hover, focus, pressed, on, on under the pointer, on with focus. Only a disabled control is free of this (WCAG 1.4.3).
- R-CONTROL-6: The mark of a state (the fill or the border of an on control, a check, a sort arrow) keeps 3 to 1 against what is next to it. Hover never takes it away: an on control under the pointer still reads as on (WCAG 1.4.11).
- R-CONTROL-7: On is never colour alone. Add one of: a filled shape among outlined ones, a heavier weight, a check icon, an underline (WCAG 1.4.1). Set the state for assistive technology too: `aria-pressed` on a toggle button, `aria-current="page"` on the current link, `aria-selected` on a tab, `aria-sort` on a sorted column head (WCAG 4.1.2).
- R-CONTROL-8: The label of a control never changes and never disappears with its state. "Weekly" stays "Weekly" at rest, on and under the pointer.
- R-CONTROL-9: A hover look and `cursor: pointer` belong only to controls. A row, a card or a heading that does nothing when pressed gets neither.
- R-CONTROL-10: A control that cannot be used takes the kit's `disabled` prop, never only a grey style. Text near it says why when the reason is not plain.
- R-CONTROL-29: The label of a control is not text to select. A kit button brings that; a control you write yourself takes `user-select: none`. Else a double click beside it, or a drag across a row of controls, selects the labels.

## What a control does

- R-CONTROL-11: Every control changes something a person can see: the numbers, the rows, their order, the view. What only its own section shows is kept in `useState` there and rendered from it; what another section shows too is a shared value (R-CONTROL-12). A control that takes a press and changes nothing is a defect, in a prototype too.
- R-CONTROL-12: A shared value is what a person chose on the page that more than one section shows: the date range, the grouping, the search text. When `sharedValues` in the context lists them (the version's `v<N>/src/json/shared.json`), the section also takes `shared` and `setShared` (R-COMPOSE-2). The section that holds the control sets the value, `setShared({ range: '30d' })`, and shows it as chosen from `shared.range`; every section the value governs reads `shared.range` and renders from it. Never keep a copy of a shared value in `useState`, and never pass it another way (the address, storage, an event, a global).
- R-CONTROL-27: Read a shared value only as `shared.<id>` or `shared['<id>']` and set it only as `setShared({ <id>: … })`, never through a destructured copy: the check reads the code for these forms, and a value that no section sets or no section reads is an `ux/shared-unused` finding. Type a list of choices by the value, `Shared['range']`, so a wrong id fails the type check.
- R-CONTROL-28: When the brief wants a control of your section to change another section and the context has no shared value for it, do not fake it and do not leave it dead: answer `STATUS: NEEDS_CONTEXT` and name the control and both sections, so the value can be added to `shared.json`.
- R-CONTROL-13: A control whose result lies outside the screen (another page, a download, a sign-out) is named in the brief as leading out. Write it as its real element: a link with an `href`, or a button. A button answers the press with a short line in a `role="status"` element that names what started ("Export started"). Invent no other result.
- R-CONTROL-14: Each choice shows its own content from the brief. When the brief gives the content of one choice only, keep the others consistent with it (the same totals, split another way) and say in the report which numbers you derived.
- R-CONTROL-15: A choice that leaves nothing to show gets a line that says what was chosen and one action that clears it. The controls stay in place and usable in the empty, loading and error states (R-COMPOSE-17).

## Patterns

- R-CONTROL-16: Choose the pattern by what the control does, and keep to it. One of several choices that changes the content: a group of buttons with `aria-pressed`, one always on, inside an element with `role="group"` and a label; each button is a Tab stop and takes Space and Enter. Separate views: the kit's tabs, when it has them. Never a mix of the two.
- R-CONTROL-17: A filter changes every part it governs at once, and the screen says what is shown: a count or a summary that changes with it ("12 accounts, Business plan"). One action returns every filter to its default.
- R-CONTROL-18: A column head that shows a sort mark is a button inside its `th`. Pressing it sorts the rows and turns the mark. `aria-sort` stands on the one sorted column. A column that cannot be sorted shows no mark.
- R-CONTROL-19: A select is the kit's `Select` (R-COMPOSE-7). Its list is the kit's and the browser's to draw: do not style the options and do not build a list of your own. Choosing a value changes what the section shows.
- R-CONTROL-20: A search field has a visible label that names what it searches (R-COMPOSE-31) and filters that list as the person types. No match: R-CONTROL-15.
- R-CONTROL-21: A link goes somewhere, a button does something. A card that opens a page is one link, not a card with a second target hidden in it.

## The brief and the layout

The skill settles these before any maker starts.

- R-CONTROL-22: The brief has a line for every control of the screen: what it changes and where (the four numbers, the rows of the table), its values and the default, whether one is always on, and what shows when nothing matches. Or it says that the control leads out of the screen.
- R-CONTROL-23: The brief holds the content of each choice, or says how it follows from the default (R-CONTROL-14).
- R-CONTROL-24: A control that changes only its own section needs nothing more. For every control that changes another section, the version has a shared value in `v<N>/src/json/shared.json`: `{ "schemaVersion": 1, "values": [{ "id": "range", "label": "Date range", "default": "30d", "values": [{ "id": "7d", "label": "Last 7 days" }, { "id": "30d", "label": "Last 30 days" }] }, { "id": "query", "label": "Search" }] }`. A value with `values` is a list of 2 to 24 choices and needs a `default` among them; one without is free text (its `default` is at most 80 characters, empty when left out). At most 12 values, ids in lower case. The `## shared` part of `layout.md` names, for each value, the section that sets it and the sections that read it. Never split a control from what it changes without one.
- R-CONTROL-25: A screen has only the controls the brief can answer for. Leave a control out rather than draw one that does nothing.

## Before the report

- R-CONTROL-26: Go through every control of the section: what a press changes; how it looks on, on under the pointer and on with focus; whether its label stays. For a shared value: that your section sets it or reads it as the layout says. Name in the report each control that leads out, and each one you could not make work, with the reason.
