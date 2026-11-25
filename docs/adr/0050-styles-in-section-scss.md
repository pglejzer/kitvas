# 0050. Styles in section SCSS

Date: 2026-11-23. Status: accepted, changed in part by ADR 0067. Spec: `docs/specs/2026-11-23-kitvas-stage-4a-editor-core-design.md`, decisions 3 and 9.

## Context

A style change in the editor must land where the value already lives, or the draft ends up with two places that set the same thing (a `gap` rule on a `Stack` that has a `gap` prop). It must also keep to the kit: tokens first, and an off-kit value visible instead of silent.

## Decision

- **The source of a value is decided in a fixed order**, by the pure function `styleSource` (`src/edit/domain/source.ts`), for each style property of the selected element:
  1. `prop`: a catalog prop of the kit component that sets the property. Its name is in the table for the property (`gap` for `gap`, `padding` or `p` for `padding`, `size` for `font-size`, and so on), and it is an enum whose values are all names of one token group of the property's kind (`none` may sit beside the scale; names match ignoring case and separators). A prop named exactly like the property (`gap`, `padding`, `fontSize`) is the source whatever its values, because the kit's own words for a scale (`tight`, `normal`) are still the kit's place for it; writing SCSS over it would be the double source this ADR rules out. A part tag (`Card.Header`) takes no prop of its root. Whether the tag writes the prop does not matter: the prop is the place, and the edit is a `setProp`.
  2. `scss`: the element's class rule in the section SCSS has a declaration of the property directly in its body. A declaration only inside a nested block or `@media` is not it.
  3. `utility`: the draft is a Tailwind draft and a class matches the property's utility prefixes (`md:` and other prefixes are stripped first). Shown read-only in 4a with the class named; the person can "Ask Claude". Editing utilities comes in a later part.
  4. `kit`: the kit's default or inheritance. The edit writes the class rule and the row says it overrides the kit.
- **Where a new rule goes.** A style edit with no source in the draft goes to the element's class rule in its section's SCSS file (`src/scss/sections/<id>.scss`, or `_<id>.scss`). An element with no class gets one (`addClass` in the TSX) and the rule is created in the same request, atomically (ADR 0049). The class name comes from the tag in kebab case, made unique in both the TSX and the SCSS.
- **Tokens.** Values are written as `var(--kit-…)`. Pickers and steppers offer the kit's tokens first and step through the kit's scale.
- **Off-kit values.** A raw value the person types is written as typed, followed by the marker `/* off-kit */` after its semicolon. The marker is read back as `offKit: true`, shown in the control and in the session's change list, and counted. "Map to nearest token" is one `setStyle` from the raw value to `nearestToken`, a pure function over the kit's tokens of the same type.
- **Never inline.** An edit never writes a `style` attribute into the TSX, and never adds an SCSS override on top of a kit prop that sets the same thing.
- **Tailwind drafts.** In 4a props and text are editable and styles are read-only; each style row names the utility class.

## Consequences

The panel can tell the person, per row, whether an edit sets a prop or adds CSS, and the diff is one declaration or one prop. Off-kit values stay possible but never hide. The prop table is a heuristic over names and token groups, so a kit whose props do not follow it shows rows as `scss` or `kit` and loses nothing but the shortcut.
