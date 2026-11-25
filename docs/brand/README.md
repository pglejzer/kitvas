# KitvasLogo

Logo of kitvas, a Claude Code plugin that builds UI prototypes from a design system (a kit) and shows them in a local studio (a canvas): a mark of solid blocks plus the word mark kitvas, one colour.

Copy KitvasLogo.tsx into your project and import it where you need it. The component uses only the design tokens and components of the kit it was made for.

## Files

Made with `/kitvas:craft` (draft `kitvas-logo-blocks`, sketch A). The SVG files hold the same paths as the component, with a fixed colour.

- `KitvasLogo.tsx`: the React component. `size` is the height; under 24 px it draws the mark alone.
- `kitvas-logo.svg`, `kitvas-logo-white.svg`: the mark with the word mark, for light and for dark grounds.
- `kitvas-mark.svg`, `kitvas-mark-white.svg`: the mark alone.
- `kitvas-icon.svg`: the white mark on an ink square, 512 px. `.claude-plugin/icon.png` is this file as a PNG.

The colours are the Base kit's ink (`#1d2025`) and white.

The studio draws its logo from the paths of `kitvas-logo.svg` (`src/studio/pages/brand/logo.ts`, in the text's colour); a test fails when they differ, so change both together.
