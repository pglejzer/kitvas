# 0067. Nested class rules, and class names after the section

Date: 2026-11-24. Status: accepted. Changes in part ADR 0050 (step 2 of the source order, and where a new class's name comes from).

## Context

The maker writes BEM in SCSS: `.plans { &__switch { … } }`. The editor's SCSS writer read only top-level rules whose selector is one class, so for it `plans__switch` had no rule. A width set on the switch appended a second, flat `.plans__switch { width: …; }` at the end of the file, and the properties panel showed only that rule's values: the background, border, radius and padding the maker wrote were gone from the panel. A class with two rules was then refused as `ambiguous`, and drafts edited so far already hold both. New classes were named after the tag alone (`button`, `heading`), unique only inside one file, while every section's styles end in one stylesheet, where a bare `button` of one section styles the buttons of all the others.

## Decision

- **A nested rule that only joins a class name to `&` is that class's rule.** Inside a top-level rule of one class, at any depth inside such rules, a rule whose prelude is `&` followed only by characters of a class name (`&__switch`, `&--featured`, `&-2`) is the rule of the joined class (`plans__switch`, `plans__card--featured`). Every other prelude keeps its meaning: `&:hover` and `@media (min-width: …)` are context blocks; `&.is-open`, `& > li`, `&::placeholder`, a list such as `&__a, &__b`, an interpolation and a join inside a width's or a state's block stay nested blocks kitvas does not write; `.dark &` and `.title` style another element.
- **The rules of a class are read together in file order**, as the cascade reads them. A property's value is its last declaration among them, and a change of that value is written there. A new declaration goes into the class's last rule, so no later rule of the class wins over it, except when a rule has a width block that sets the property: then it goes into the first such rule, above its blocks, so the width still wins. A new width or state block goes into the last rule too, and a new value there is refused (`ambiguous`) when another rule sets the property in a block of the same state at a wider width, which the new block would then beat. Two declarations of one property in one rule stay `ambiguous`. `listRules` still lists each top-level rule as written; `readRule` gives the merged view, with the span of the last rule.
- **A new declaration stands above the body's first context block or joined rule**, so a modifier written as `&--row` keeps winning over the base.
- **A class with no rule yet** whose name starts with a top-level class of the file followed by `__` or `--` gets its rule nested at the end of that class's last rule, as `&__part { … }`, in the body's indent and line endings; the longest such class wins. Any other name, or a rule whose last declaration has no `;`, gets a flat rule at the end of the file as before. The inverse takes either away byte for byte.
- **New class names carry the section's block**: `<block>__<part>`. The block is the one class of the root element of the JSX the element is in, up to its first `__` or `--` (a helper component's root `plans__card` is in `plans`), else the file's name in kebab case; the part is the tag in kebab case. A root without a class takes the block alone while no one has it. The name is unique against the classes of the TSX, every class rule of the SCSS (nested ones too) and any selector naming it, with `-2`, `-3`.
- **`min-width` and `min-height`** join the editor's properties, with the tokens and the off-kit rule of `width` and `height`.

## Turned down

- **Rewriting the file flat.** Turning `&__switch` into `.plans__switch` on the first edit would make the editor's first touch rewrite the maker's whole file, against the rule that an edit touches only its own span, and the person's diff would no longer show what they changed.
- **Refusing a class with two rules.** Drafts edited so far already hold a nested rule and an appended flat one; refusing them would leave every such element without styles in the editor, with no way to repair it there.

## Consequences

`scss-rules.ts` reads the class rules; the writer, the context writer and the overrides work over the list of a class's rules. The inspect shows the merged values of a class, so the panel sees what the maker wrote. A width block of a class may stand in two rules; the panel shows the last value of each property, and a removal there shows the earlier one again, as the browser does. New classes no longer collide across sections, and most of them nest in the section's own rule.
