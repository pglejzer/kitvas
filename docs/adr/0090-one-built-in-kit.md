# 0090. One built-in kit, made from the studio's look

Date: 2026-11-27. Status: accepted. Changes in part `0087-select-list-in-the-page.md`. Builds on `0057-studio-theme.md` and `0076-project-decisions-file.md`, which were written when the built-in kit was Base. Spec: `docs/specs/2026-11-27-kitvas-ui-kit-design.md`.

## Context

kitvas shipped one built-in kit, Base: twelve components, one light look and the system's font. It was the default of every project. The studio has had a look of its own since ADR 0057: its tokens in light and dark, four accents, a typeface and 62 icons. The owner wanted that look as a design system a person can build with, complete enough to make a whole product screen. The first plan put it beside Base as a second built-in kit. While it was built he asked what a second kit was for, and chose one.

## Decision

- **The built-in kit is `kitvas-ui`.** `kits/kitvas-ui/` holds 47 components in eight categories, the studio's 62 icons, the typeface Figtree and eight themes: light and dark, each also with a teal, a coral and a rose accent. It is the default kit of a project. `DEFAULT_KIT` in `src/shared/settings/decisions.ts` is the one place that names it, and a decisions file that names a kit which does not exist falls back to it (ADR 0076 said `base`).
- **Base leaves the repo.** `kits/base/` and its test are removed. The id `base` is not kept as an alias and no copy of the kit stays for the tests: a test that proves kitvas with its built-in kit runs on `kitvas-ui`, and a test that needs only "a kit" keeps the fixture kit `tiny`.
- **The kit's tokens are written from the studio's.** `npm run kit-ui-tokens` (`scripts/kitvas-ui-tokens.ts`) reads `src/studio/theme/tokens.ts` and writes the kit's token file for each theme, the sheet of locals that holds the shadows and the easing, and the icon paths. `test/guards/kitvas-ui-tokens.test.ts` fails when they are stale. The studio's own pages do not use the kit.
- **The built-in kit has a dark set and accents.** ADR 0057 turned that down for Base, whose quiet look was what its users chose. This kit is the studio's look from the start, so its themes are the studio's, one theme for each pair of mode and accent.
- **The studio's density is the default, and each scale goes on upward.** A control is 28 px (`sm`), 36 or 44; type runs from 11 to 48 px; space from 2 to 96 px.
- **The kit does what the checks ask of any kit.** A field and a toggle have a real border, because the checks read only a border as an edge. The accent never colours text, because it reads 4.5 to 1 on two of the four grounds only. A control's quiet fill steps up with the surface it is on. The rules are in `kits/kitvas-ui/AGENTS.md`, and `test/kit/kitvas-ui-kit.test.ts` holds every colour pair to every theme.
- **The Select of ADR 0087 lives in this kit**, in `scss/input/_select.scss`. Its list opens under the field and goes above it only when it does not fit below (`position-try-order: normal`): the browser's own order takes the side with more room, which in the middle of a page is the one above.
- **Licence.** The kit is under the MIT License, as Base was. The typeface is third-party material under the SIL Open Font License.

## Turned down

- **Two built-in kits: Base as the default, `kitvas-ui` chosen on purpose.** The spec's first form. Two kits to keep, document and test, and one more question in every skill, for a kit nobody asked to keep.
- **Base kept as a fixture for the tests, or the id `base` kept as an alias.** A second copy of a kit that is gone. Nothing is released yet, so no project depends on the id.
- **One stylesheet for the studio and the kit.** Every fix to the studio would change people's drafts.
- **The studio rebuilt on the kit.** The studio is not written in React, so it means a rewrite of every page and pane before the release. This decision does not block it later.
- **Token types for a shadow and an easing curve.** Fourteen files read token types. The two stay locals of the kit's own sheet.
- **A second option for the accent.** ADR 0083 turned down a second attribute and a second kind of option. An accent is a theme.
- **A Select with a list written by hand and a search box.** The first pass built one. ADR 0087 had turned it down, and its list was cut by the surface it sat in. It was taken out.

## Consequences

A draft made with Base no longer builds as it was: its props and tokens are Base's. A project whose decisions file says `kit: base` gets the built-in kit and a warning from `kitvas doctor`. The plugin carries two font files. A change to the studio's tokens needs `npm run kit-ui-tokens`, or the guard test fails. Text at the kit's default size is 13 px, so at 390 px the rule `ui/text-size` reports a paragraph of three lines or more: running text takes `size="lg"`.
