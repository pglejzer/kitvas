# KitvasLogo

Logo of kitvas, a Claude Code plugin that builds UI prototypes from a design system (a kit) and shows them in a local studio (a canvas): a dovetail of two kit parts, the word kitvas, and two loose parts as the dot of the i and a full stop. Copper and ink.

The component has no imports and no dependencies. The logo is not free to use: no one may change it or use it outside kitvas ("The kitvas name and logo" in `LICENSING.md`).

## Files

Made with `/kitvas:craft` (draft `kitvas-logo-fable`, version 3, sketch A). The SVG files hold the same paths as the component, with a fixed colour.

- `KitvasLogo.tsx`: the React component. `size` is the height; under 24 px it draws the icon alone. `tone` is `colour` (copper icon and parts, the word in `currentColor`) or `mono` (everything in `currentColor`).
- `kitvas-logo.svg`, `kitvas-logo-white.svg`: the icon with the word and the two loose parts, for light and for dark grounds.
- `kitvas-mark.svg`, `kitvas-mark-white.svg`: the icon alone, in copper and in white (for one-colour use on dark or photo grounds).
- `kitvas-icon.svg`: the copper icon on an ink square, 512 px. `.claude-plugin/icon.png` is this file as a PNG.

The colours are copper (`#b4571a`), ink (`#1d2025`) and white (`#ffffff`).

The studio draws its logo from the paths of `kitvas-logo.svg` (`src/studio/pages/brand/logo.ts`, the icon and the parts in the studio's accent, the word in the text's colour); a test fails when they differ, so change both together.

No trademark register was searched for the mark; before public or commercial use, check it.
