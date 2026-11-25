# 0070. A shorthand is read as a source and written in place

Date: 2026-11-25. Status: accepted. Adds to ADR 0050 (step 2 of the source order: a shorthand that holds the property is a source too).

## Context

The maker and people write shorthands: `padding: var(--kit-space-sm) var(--kit-space-lg)`, `border: 1px solid var(--kit-color-line)`, `background: var(--kit-color-surface)`. The editor read only a declaration of the exact property. The row of `padding-left` or `border-color` said "kit default" beside a rule that sets it, the box model opened on one side for a rule that sets all four with one value, and an edit added `padding-left: …` at the end of the rule: a second place for a value the shorthand still states. This is write-back to a person's code. A rule must never be damaged, and a value kitvas cannot take apart must stay exactly as written.

## Decision

- **Ten shorthands are read.** `padding` and `margin` (one to four values) hold their four sides and their `-block` and `-inline` pairs. The four pairs (one or two values) hold two sides each. `border` and `outline` hold width, style and colour. `background` holds colour and image. `flex-flow` holds direction and wrap. Sides are named as a page read left to right has them: the inline start is the left.
- **The source of a property is the last declaration of the class's rules that sets it**: the property itself, or a shorthand that holds it. A longhand after the shorthand wins and one before it loses, as in the cascade. `styleSource` then answers `scss` with `via: <shorthand>` and the value and off-kit mark of the part. A pair read from `padding` or `margin` is one value when its two sides are equal, else its two values, the start first.
- **A value splits only when every part of it is understood.** `!important`, a comment, `#{…}`, a `$variable`, a string, a comma outside brackets, a function other than `var`, `calc`, `url` and the colour functions, a part the shorthand does not take and a second width, style, colour or image leave the value whole. A `var(--kit-…)` in `border`, `outline` or `background` is a width or a colour by the type of its token in the kit; a `var` no token types leaves the value whole. A shorthand that does not split is not a source: the row reads as it did before this ADR.
- **A change is written into the shorthand.** Only the part of the property changes; every other part stays as written. A box or a pair comes back as the fewest values that say it. A part the shorthand does not hold yet (a colour for `border: 1px solid`) goes at its end. `before` is the part's value as read, and a stale one is a conflict as for any declaration.
- **A shorthand that cannot take the change is never touched.** When the shorthand stands last for the property but its value does not split, or CSS has no such value for it, the property is added as its own declaration right after the shorthand in the same rule. The shorthand's text does not change by one character.
- **Removing.** A part leaves `border`, `outline`, `background` and `flex-flow`, and the declaration goes with its last part. A side of `padding`, `margin` or a pair cannot leave alone, because no value says a box without one side: the op is refused (`not-found`) and the panel offers no reset on that row. The whole `padding` or `margin` has its reset.
- **The off-kit marker** stays after the shorthand while any of its parts is a raw value (a length, a colour by code or name). A keyword (`solid`, `auto`, `row`) and an image are never raw.
- **The same holds in a width's or a state's block (ADR 0055) and in a nested class rule (ADR 0067).** `overrides` lists the parts of a block's shorthand with `via`. A shorthand inside a block kitvas does not read is no source, as a declaration there is none.
- **Undo.** The inverse ops do not always give the bytes back: a value written longer than it has to be comes back shorter, and a part added again goes to the end. The server tries the inverse on the texts it made, and where it is not exact the answer's inverse is the file's own hunks, as for context blocks.
- **The panel.** A row whose value a shorthand holds names it ("from padding of .card"). The box model opens on the link the rule says: four equal sides on all sides, equal sides on each axis on the pairs, anything else on one side.

## Turned down

- **Always adding the longhand under the shorthand.** It never touches the shorthand, but the rule then states one value in two places: `padding: 8px 16px` and `padding-left: 24px` after it. The shorthand goes stale, the next reader has to run the cascade in their head, and a later edit of the whole `padding` loses to the line under it. It stays only as the fallback for a shorthand that cannot be taken apart.
- **Rewriting a shorthand into longhands on the first edit.** One click on one side would replace a line the person wrote with four lines of kitvas, a diff nobody asked for, and no op could give the line back.

## Consequences

The `scss` source and the entries of `overrides` gain `via`; `ScssOptions` gains `varKind`, the token types a request reads its shorthands with. The reader knows these ten shorthands and no other: `font`, `inset`, `border-top`, `transition` and the rest read as before. A longhand written before a shorthand that does not split still reads as the source, although the browser lets the shorthand win; the editor leaves that rule as it finds it. The checks in `src/checks/` are not changed: they find a raw colour or spacing inside a shorthand with their own reader.
