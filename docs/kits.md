# Your design system

A kit describes one design system: components, tokens and icons. The rework and craft skills look for yours first (`kitvas kit detect`) and offer to learn it before they fall back to Base. For the rest of kitvas, see the [README](../README.md).

kitvas can learn from:

- an npm package (public or private) or a folder of your own components, with Tailwind v4 supported;
- a Figma file, read through your own Figma MCP;
- a website, or screenshots.

To set one up:

1. If it is a package, install it in your project yourself. kitvas never installs a design system.
2. Run `/kitvas:learn`. The kit lives in `.kitvas/kits/<id>/`; commit it to share it with your team.
3. `kitvas kit verify <id>` checks the kit against your real packages: imports, types, every example rendered in the browser, and the tokens. `/kitvas:learn` fixes what it reports.
4. `kitvas kit use <id>` makes it the project's kit.

What craft adds goes to `.kitvas/additions/<kit-id>/`, next to the kit, never into the kit's package.

## Themes

A kit may have themes, such as light and dark (ADR 0083). `tokens.themes` in `kit.json` lists them:

```json
"themes": {
  "default": "light",
  "list": [
    { "id": "light", "label": "Light" },
    { "id": "dark", "label": "Dark", "file": "json/tokens.dark.json", "attributes": { "data-mui-color-scheme": "dark" } }
  ]
}
```

- The default theme is the kit's own token file, so it has no `file` and no `attributes`.
- Another theme's file holds only the tokens whose values differ, at the same paths and with the same types as the base. A path or a type the base lacks is a problem of the kit. A token takes `$type` from its group in the base, and a base token that points at a changed one follows it.
- `attributes` are what the design system's own components need to switch, `class` or a `data-…` name. The page puts them on `<body>` while the theme shows. A system whose components take every colour from the kit's tokens needs none.
- A version offers themes with the option `theme` in its `options.json`; its values are the kit's theme ids.

Your project can add what the kit lacks without changing the kit, in `.kitvas/additions/<kit-id>/`:

- `tokens.json` holds new tokens, in the same shape as the kit's token file. A path the kit already has is refused.
- `tokens.<theme>.json` holds the values of one theme. A theme id the kit lacks is a new theme, labelled with its id. A value the kit's own theme file sets is refused, and so is a file for the default theme.

Added tokens and themes are marked "Added by this project" in the studio. A file with a problem is left out, and `kitvas kit check <id>` names it; the rest of the kit still works.
