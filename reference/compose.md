# Rules for makers

Read by the `maker` agent before it writes a section. Each rule has an id; reports cite it.

## Structure

- R-COMPOSE-1: Write exactly two files per section: the TSX file and the SCSS file named in `files` of the context. Nothing else, nothing outside the draft folder.
- R-COMPOSE-2: The TSX exports one function component named as `section.component` in the context. It takes `{ state: string }` and nothing else.
- R-COMPOSE-3: Never edit the generated entry files `index.tsx` and `index.scss`, and never write another section's files.
- R-COMPOSE-4: Import only from `@kit`, `react` and the draft's own files (`./` and `../`). Any other import is a `ds/foreign-import` finding.
- R-COMPOSE-5: Give the section's root element the section id as its class name, for example `className="hero"`. Style it from the SCSS file with that class.

## Kit components

- R-COMPOSE-6: Use only components listed in `kit.components` of the context, with the props and values listed there. Required props are always set.
- R-COMPOSE-7: Use a kit component for every button, input, select and dialog. A plain `<button>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` is a `ds/raw-control` finding.
- R-COMPOSE-8: Icons come only from the names in `kit.icons`.
- R-COMPOSE-9: If the design needs a component or prop the kit lacks, use the nearest listed one and say so in the report. Never invent a name.

## Tokens and styles

- R-COMPOSE-10: Colours, type sizes, spacing, radius and motion come from `var(--kit-…)` names listed in `kit.tokens`. A name not on the list is a `ds/unknown-token` finding.
- R-COMPOSE-11: No hex, `rgb()`, `hsl()` or colour names in styles. No pixel or rem value that equals a spacing, radius or font-size token: write the token.
- R-COMPOSE-12: Lay out with the kit's `Stack` and `Grid` when the context lists them; use SCSS only for what they cannot do (widths, alignment, responsive changes).
- R-COMPOSE-13: Never address elements by tag or class from another section. Each section styles only its own class.
- R-COMPOSE-14: Make the layout work at 390 px and at 1280 px wide.

## States

- R-COMPOSE-15: Show something for every state in `states` of the context. A state that shows nothing is a `runtime/blank` finding.
- R-COMPOSE-16: Choose by the `state` prop, for example `state === 'empty'`. Do not read the address, storage or a timer.
- R-COMPOSE-17: An empty state says what is missing and what to do. A loading state says that it is loading. An error state says what went wrong and offers a way on.
- R-COMPOSE-18: The default state shows real content from the brief: real names, numbers and sentences. No lorem ipsum, no "Item 1".

## Project kits and Tailwind

- R-COMPOSE-28: A project kit (learned from the person's own design system) follows every rule above. Imports still come only from `@kit`, never from the design system's package or the project's folders.
- R-COMPOSE-29: When `styling` in the context is `tailwind`, put utility classes from the theme in `className`; the context's `classes` lists the theme variables. Do not write arbitrary values such as `p-[13px]` or `bg-[#fff]`: that is a `ds/tailwind-arbitrary` finding. A class that makes no CSS is a `ds/tailwind-unknown` finding.
- R-COMPOSE-30: With `styling: 'tailwind'` the section SCSS file is still written, but it may hold only what classes cannot do, using `var(--kit-…)` names.

## Element ids

- R-COMPOSE-19: Do not add `data-ks` yourself. The build stamps every host element; findings point to elements by those ids.
- R-COMPOSE-20: Keep the JSX tree stable between versions: do not wrap or reorder elements without a reason, so ids do not shift.

## Accessibility

- R-COMPOSE-21: One `Heading` per level, in order; the first section holds the page's level 1.
- R-COMPOSE-22: Every control has a visible label or an `aria-label`. An image has `alt` text, or `alt=""` when it only decorates.
- R-COMPOSE-23: Text and its background keep a 4.5 to 1 contrast. Pick text and background tokens that are meant to go together.
- R-COMPOSE-24: Interactive elements are at least 24 px wide and tall, and keep a visible focus ring. Do not remove outlines.
- R-COMPOSE-25: Status is never shown by colour alone: add text or an icon.
- R-COMPOSE-26: Images are files in the version's `v<n>/src/img` folder, referred to as `../img/<file>` from a section's styles. No remote addresses.

## UI and UX

- R-COMPOSE-31: Every field has a visible label. Never only a placeholder or an `aria-label` (`ux/visible-label`).
- R-COMPOSE-32: One primary action per section. Other actions use a secondary variant of the kit's button (`ux/one-primary`).
- R-COMPOSE-33: An empty state says what goes there and gives one action. A loading state shows an indicator: a feedback component, or `aria-busy` or `role="status"`. An error state says what failed and gives a way on.
- R-COMPOSE-34: No placeholder copy: no lorem ipsum, "Title here", "Click me" or "Item 1" (`ux/placeholder-text`).
- R-COMPOSE-35: A heading sits closer to its own content than to the block above it. Set the gap above a heading larger than the gap below it, with spacing tokens.
- R-COMPOSE-36: No card inside a card. Separate parts of a card with spacing or a divider (`ui/nested-frame`).
- R-COMPOSE-37: Long text stays at about 80 characters per line or less: set a `max-width` from a token (`ui/line-length`).
- R-COMPOSE-38: Body text is at least 14 px on phones. Use the kit's body size token and never shrink it for density.

## Report

- R-COMPOSE-27: Reply in a few lines: the files written, what the kit could not give, and any rule here that was missing, wrong or hard to follow. Do not paste code.
