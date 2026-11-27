# 0091. The built-in kit has product icons of its own

Date: 2026-11-27. Status: accepted. Changes in part `0090-one-built-in-kit.md`.

## Context

ADR 0090 gave the built-in kit the studio's 62 icons and nothing more. They are an editor's icons: arrows, panels, alignment, a lock, an eye. A product screen needs others. Asked for a shopping cart button, the kit skill could only answer that the kit has none and offer to craft one, and the demo dashboard had a search glass, an upload sign and arrows to choose from.

## Decision

- The kit has 50 product icons of its own beside the studio's 62: the app's frame (home, menu, user, bell, settings), buying (cart, bag, credit card), messages, charts, time and place, files, marks and media.
- They are drawn by hand as the studio's are: a 16 px grid, a 1.4 px round stroke, no fill. They live in `scripts/kitvas-ui-icons.ts`, and `npm run kit-ui-tokens` writes them into the kit's `tsx/display/icon-paths.ts` after the studio's. A name is drawn once: the script fails on a name both sets have.
- The studio does not show them. Its sprite holds only `src/studio/pages/icons/paths.ts`.

## Turned down

- **An icon package.** A new dependency and a second drawing style beside the studio's, in a kit whose point is the studio's look.
- **The product icons in the studio's own list.** Every studio page carries that list as a sprite, so each page would hold 50 drawings it never shows.
- **The studio's icons only, and each missing one crafted.** Every product screen would begin with a round of sketches for a cart or a bell.

## Consequences

The kit names 112 icons. An icon it still lacks is crafted as before. The eval case `kit-icons` now asks for a printer, which the kit does not have.
