# 0072. One list item's style

Date: 2026-11-25. Status: accepted. Builds on ADRs 0060 (lists from the inside out, the constant first class of a `className` in code), 0065 (copies and their paths) and 0067 (where a new class rule goes). Plan 18e, task 4.

## Context

A list in a draft is one JSX element in a `.map`: the owner's pricing page renders three cards from `plans.map((plan) => <Card key={plan.id} className={plan.featured ? 'plans__card plans__card--featured' : 'plans__card'}>…)`. The editor writes a style to the element's style class, here the constant first class `plans__card` (ADR 0060), and that rule styles every copy. With the Pro card selected, a new background changed all three cards, and only one easy-to-miss line of the panel said so. A person who picks one card on the canvas often means that card.

## Decision

- **All items stay the default.** The panel offers "All N items | This item" for one selected element inside a literal list of an SCSS draft; "All" is chosen first, as list templates work in Webflow and Framer. This is the owner's choice of 2026-11-25.
- **The item's class is a modifier named by the list's key.** The key of the innermost list around the element (the `key` of its callback's root) must be `{plan.id}`: a field of that callback's parameter (or `{id}` for a field a `({ id }) =>` pattern binds), the name not bound again between the callback and the element. Every copy must hold that field as a string literal that makes a class part (`[A-Za-z0-9_-]+`, and `<class>--<value>` a name kitvas writes, so lower case), no two the same: each item of the array, and for a list inside another each item of every outer item's array, since one class would otherwise style two copies. The copy the person picked, named by its path (ADR 0060), gives the value: `plans__card--pro`. A part of the item (a price inside the card) takes the same key: `plans__price--pro`. Anything else is refused with the new reason `item-key`, and the person can Ask Claude.
- **The TSX carries the modifier for every copy, once.** The op `addItemClass { id, path, className }` adds `` <class>--${plan.id} `` to the element's `className`: a string becomes a template literal (`` `plans__card plans__card--${plan.id}` ``), a template gets it before its closing backtick, and any other expression is wrapped: `` `${plan.featured ? 'plans__card plans__card--featured' : 'plans__card'} plans__card--${plan.id}` ``. A `className` that gives the modifier already is left alone. The op names the class it expects for the copy, so a list or a class that changed meanwhile is a conflict, never a write to another item. A wrapped template still gives its inner expression's constant first class (`wrappedClass`), so "All items" keeps writing the shared rule after it.
- **The SCSS write is the ordinary style write** to the item's class. ADR 0067 already places a class with no rule: `plans__card--pro` starts with the top-level `.plans` and `__`, so its rule nests as `&__card--pro { … }` at the end of `.plans`, later in the file than `&__card`, and wins over it with the same weight.
- **Undo is the server-made inverse** (spec 4b, decision 4): `addItemClass` is no 4a op, so the answer's inverse is the files' own hunks and gives the `className` and the rule back byte for byte, from every form.
- **The inspect reads the item.** `GET …/inspect?scope=item&path=…` (a `scope` needs a `path`) answers `itemScope` with the item's class and whether the TSX gives it, or the refusal. Its `styleClass`, `scss` and `overrides` are then the item's class and rules, and each row's source is the item rule where it sets the property, else the shared rule's value with its class and without a shorthand part, since a write in this scope never goes into the shared rule. A Tailwind draft refuses the scope (`utility`); an element in no list refuses it (`not-list-item`).

## Turned down

- **An `:nth-child(2)` rule.** No TSX change, but it follows the place, not the item: moving the list's items, which the editor does, would move the style to another card.
- **An inline style, or a style field in the item's data.** It mixes the look into the content, the panel could not show it as a rule, and the editor never writes an inline `style`.
- **An attribute selector** (`[data-item="pro"]` from the key). It works for any key, but drafts write variants as BEM modifiers (ADR 0067), and the attribute would be a second way to name the same thing.

## Consequences

The first "This item" write changes the element's `className` once; later writes of that item, and of the other items, touch only the SCSS. A list whose key is an index, a computed value, a repeated value or a value that is no class name has no item scope, and the panel says why. In the item scope the widths and states shown are the item rule's own, so a width the shared rule sets shows its base value there. The lock checks read the strings inside a template's `${…}` too, so a locked card still holds its shared class after the wrap.
